import { Context, Schema, Session, $ } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'
import { } from '@koishijs/plugin-adapter-qq'
import * as fs from 'fs/promises'
import * as path from 'path'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config {
  admin: { enabled?: boolean, members?: string[], super?: string[] }
  drsWaitTime: number
  strictMode: boolean
  humor: { enabled?: boolean, chance?: number, talks?: string[] }
  event: { enabled?: boolean, name?: string, minScore?: number }
  menuCX: MenuCX
}

enum MenuCX {
  GROUP = 1 << 0,
  LICENCE = 1 << 1,
  ROUTES = 1 << 2,
  TECHS = 1 << 3,
  QQ_ID = 1 << 4,
  OPEN_ID = 1 << 5,
}

export const Config: Schema<Config> = Schema.object({
  strictMode: Schema.boolean().default(false).description('严格模式: 未录入名字/集团/科技不可排队'),
  drsWaitTime: Schema.number()
    .default(18e5)
    .description('超时踢出前等待的时间 ms'),
  menuCX: Schema.bitset(MenuCX)
    .default(MenuCX.GROUP | MenuCX.LICENCE | MenuCX.ROUTES | MenuCX.TECHS)
    .description('要在CX指令显示的菜单项'),

  admin: Schema.intersect([
    Schema.object({
      enabled: Schema.boolean().default(true).description('启用内置权限模块'),
    }).description('权限模块配置'),
    Schema.union([
      Schema.object({
        enabled: Schema.const(true),
        members: Schema.array(String).description('管理员QQ号或openId').role('table').default([]),
        super: Schema.array(String).description('红名单QQ号或openId').role('table').default([]),
      }),
      Schema.object({}),
    ])
  ]),

  event: Schema.intersect([
    Schema.object({}).description('红活模块配置'),
    Schema.union([
      Schema.object({
        enabled: Schema.boolean().description('开启红活').default(false).hidden(),
        name: Schema.string().description('红活名称').default(''),
        minScore: Schema.number().description('红活最低分数').default(0),
      }),
      Schema.object({}),
    ])
  ]),

  humor: Schema.intersect([
    Schema.object({
      enabled: Schema.boolean().default(false).description('启用骚话模块'),
    }).description('骚话模块配置'),
    Schema.union([
      Schema.object({
        enabled: Schema.const(true).required(),
        chance: Schema.number().description('骚话概率').default(0.005),
        talks: Schema.array(String).description('骚话列表').role('table').default([]),
      }),
      Schema.object({}),
    ])
  ]),
})

declare module 'koishi' {
  interface Tables {
    players: Players
    dlines: DrsLines
    elines: RsEventLines
    erank: RsEventRanking
  }
}

// 这里是新增表的接口类型
export interface Players {
  qid: string
  openId?: string
  cachedName?: string
  licence: number
  playRoutes: Array<number>
  techs: Array<number>
  group: string
  latestLine: number
}
export interface DrsLines {
  qid: string
  lineType: string
  waitDue: number
}
export interface RsEventLines {
  qid: string
  runScore: number
  lineId: number
  lineType: string
}
export interface RsEventRanking {
  qid: string
  totalScore: number
  totalRuns: number
}

export function apply(ctx: Context, config: Config) {

  const root = path.join(ctx.baseDir, 'data', name)

  initPlayerTables()
  initRsEventTables()

  function initPlayerTables() {
    // 初始化表players
    ctx.model.extend('players', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      openId: {
        type: 'string',
        initial: null,
        nullable: true,
      },
      cachedName: {
        type: 'string',
        initial: `使用LR名字录入`,
        nullable: false,
      },
      licence: {
        type: 'integer',
        length: 2,
        initial: 6,
        nullable: false,
      },
      playRoutes: {
        type: 'array',
        initial: [0, 0, 0, 0, 0, 0],
        nullable: false,
      },
      techs: {
        type: 'array',
        initial: [0, 0, 0, 0],
        nullable: false,
      },
      group: {
        type: 'string',
        initial: '无集团',
        nullable: false,
      },
      latestLine: {
        type: 'integer',
        initial: 6,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })

    // 初始化表dlines
    ctx.model.extend('dlines', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      lineType: {
        type: 'string',
        length: 5,
        initial: 'K6',
        nullable: false,
      },
      waitDue: {
        type: 'integer',
        length: 32,
        initial: Date.now() + config.drsWaitTime,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })
  }

  function initRsEventTables() {
    //初始化表elines
    ctx.model.extend('elines', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      runScore: {
        type: 'integer',
        length: 8,
        initial: 0,
        nullable: false,
      },
      lineType: {
        type: 'string',
        length: 5,
        initial: 'HS6',
        nullable: false,
      },
      lineId: {
        type: 'integer',
        initial: 0,
        nullable: false,
      },
    }, {
      primary: 'lineId',
      autoInc: true,
    })

    // 初始化表erank
    ctx.model.extend('erank', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      totalScore: {
        type: 'integer',
        length: 8,
        initial: 0,
        nullable: false,
      },
      totalRuns: {
        type: 'integer',
        initial: 0,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })
  }

  //主监听用户输入
  ctx.on('message', async (session) => {

    console.log(`\n${session.userId}: ${session.content}`)
    console.log(config.menuCX)

    //骚话模块
    saohuaTalk(session)

  })

  ctx.command('CZHX', '重置所有玩家数据')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      // 重置players及dlines
      resetATable('players')
      resetATable('dlines')
      initPlayerTables()
      session.send('已重置所有玩家数据')
    })

  ctx.command('CZ <userId>', '重置单个玩家数据')
    .action(async ({ session }, userId) => {
      if (!(await isAdmin(session))) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, userId)
      if (!qqid) {
        session.send('未找到该玩家')
        return
      }
      try {
        await ctx.database.remove('players', { qid: qqid })
        await ctx.database.remove('dlines', { qid: qqid })
        await ctx.database.remove('elines', { qid: qqid })
        await ctx.database.remove('erank', { qid: qqid })
      } catch (error) {
        console.log(`error:重置${userId}数据`)
      }
      session.send(`-\n已重置${userId}数据`)
    })

  ctx.command('CSH <qid> [openId]', '初始化玩家数据')
    .action(async ({ session }, qid, openId?) => {
      let admin = await isAdmin(session)
      if (!qid || isNaN(+qid)) {
        session.send('初始化失败,请使用正确指令\nCSH (自己的QID)')
        return
      }
      if (!!openId && !admin) {
        session.send('初始化失败\n无管理权限只能初始化自己')
        return
      }
      let isInit = await isInitialized(session, qid)
      if (isInit && !admin) {
        session.send('初始化失败\n玩家信息已初始化,请勿重复操作,如需更改请联系管理')
        return
      }
      if (!openId) openId = session.userId
      console.log(`${openId}: 绑定了${qid}`)
      await ctx.database.upsert('players', () => [{ qid: qid, openId: openId, cachedName: qid }])
      session.send(`${openId}: 绑定了${qid}\n请使用LR名字 LR集团 LR科技录入信息`)
    })

  ctx.command('D <arg>', '加入三人组队')
    .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
    .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
    .alias('D6', { args: ['6'] }).alias('K6', { args: ['6'] }).alias('HS6', { args: ['6'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(initMessage(session))
        return
      }
      if (arg == undefined) {
        let qqid = await getQQid(session)
        try {
          arg = '' + (await ctx.database.get('players', { qid: qqid }))[0].latestLine
        } catch (error) {
          await ctx.database.upsert('players', (row) => [{ qid: qqid, latestLine: row.licence }])
          return
        }
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `D${arg}`)
        return
      }
      if (arg == '6') {
        session.send('暗红星最低为7级💦')
        return
      }
      session.send('请输入正确队列数字7-12')
    })
  ctx.command('K <arg>', '加入双人组队')
    .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
    .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(initMessage(session))
        return
      }
      if (arg == undefined) {
        let qqid = await getQQid(session)
        try {
          arg = '' + (await ctx.database.get('players', { qid: qqid }))[0].latestLine
        } catch (error) {
          await ctx.database.upsert('players', (row) => [{ qid: qqid, latestLine: row.licence }])
          return
        }
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `K${arg}`)
        return
      }
      if (arg == '6') {
        session.send('暗红星最低为7级💦')
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  ctx.command('HS <arg>', '加入单人红活')
    .alias('HS7', { args: ['7'] }).alias('HS8', { args: ['8'] }).alias('HS9', { args: ['9'] })
    .alias('HS10', { args: ['10'] }).alias('HS11', { args: ['11'] }).alias('HS12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(initMessage(session))
        return
      }
      if (!config.event.enabled) {
        session.send('红活未开启,禁止加入')
        return
      }
      if (arg == undefined) {
        let qqid = await getQQid(session)
        try {
          arg = '' + (await ctx.database.get('players', { qid: qqid }))[0].latestLine
        } catch (error) {
          await ctx.database.upsert('players', (row) => [{ qid: qqid, latestLine: row.licence }])
          return
        }
      }
      if (isValidDrsNum(+arg) || arg == '6') {
        await join_rs_event(session, arg)
        return
      }
      session.send('请输入正确队列数字6-12')
    })

  ctx.command('TC', '退出所有列队')
    .action(async ({ session }) => {
      await quit_drs(session)
    })

  ctx.command('CK [arg]', '查询排队情况')
    .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
    .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      if (isValidDrsNum(+arg)) {
        await session.send(await showALine(session, +arg))
      }
      else await session.send(await showAllLines(session))
    })

  ctx.command('CX [userId]', '查询玩家信息')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId, true)
      if (!qqid) return
      let isInit = await isInitialized(session, qqid)

      console.log(`${await getQQid(session)}: 试图查询${qqid}信息`)
      if (!qqid || !isInit) session.send(initMessage(session))
      else session.send(await formatted_playerdata(session, qqid))
    })

  //更新玩家信息
  ctx.command('LR科技 <techString> [playerId]', '玩家录入科技')
    .alias('LR')
    .action(async ({ session }, techString, playerId?) => {
      if (playerId != undefined && !(await isAdmin(session))) {
        session.send('请录入正确科技格式\nLR科技 创1富2延3强4\n可复制消息直接修改')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      let techs_in: number[] = validateTechs(techString)
      if (!techs_in) {
        session.send('请录入正确科技格式\nLR科技 创1富2延3强4')
        return
      }
      await ctx.database.upsert('players', () => [{ qid: qqid, techs: techs_in }])
      await session.send(`已录入${techString}`)
    })
  ctx.command('LR名字 <nick> [playerId]', '玩家录入名字')
    .alias('LR账号')
    .action(async ({ session }, nick, playerId?) => {
      if (playerId != undefined && !(await isAdmin(session))) {
        session.send('请录入正确名字格式\nLR名字 高声放歌\n名字不能带有空格')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (!nick) {
        session.send('请录入正确名字格式\nLR名字 高声放歌')
        return
      }
      else {
        await ctx.database.upsert('players', () => [{ qid: qqid, cachedName: nick }])
        await session.send(`已录入名字 ${nick}`)
      }
    })
  ctx.command('LR集团 <playerGroup> [playerId]', '玩家录入集团')
    .alias('LR常驻集团')
    .action(async ({ session }, playerGroup, playerId?) => {
      if (playerId != undefined && !(await isAdmin(session))) {
        session.send('请录入正确集团格式\nLR集团 第〇序列\n集团名字不能带有空格')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (!playerGroup) {
        session.send('请录入正确集团格式\nLR集团 第〇序列')
        return
      }
      else {
        await ctx.database.upsert('players', () => [{ qid: qqid, group: playerGroup }])
        await session.send(`已录入集团 ${playerGroup}`)
      }
    })

  ctx.command('SQ <licence> <playerId>', '管理授权车牌')
    .action(async ({ session }, licence, playerId) => {
      if (!(await isAdmin(session))) {
        session.send('无管理权限,请联系管理上牌')
        return
      }
      if (!playerId || isNaN(+playerId)) {
        session.send('请输入正确玩家id\n例: SQ D9 114514')
        return
      }
      let qqid = playerId //这里允许管理员对没有初始化的玩家上牌
      let isInit = await isInitialized(session, qqid)
      if (!qqid || !isInit) return

      let licenceNum = +(licence.substring(1))
      if (!isValidDrsNum(licenceNum) && licenceNum != 6) {
        await session.send('请输入正确车牌D7-12,或D6以撤销车牌')
        return
      }
      console.log(`${qqid}:正在获取D${licenceNum}车牌`)
      await ctx.database.upsert('players', () => [{ qid: qqid, licence: licenceNum }])
      await session.send(`已授予${await getUserName(session, qqid)} D${licenceNum}车牌`)
    })

  ctx.command('KGH [eState]', '管理开关红活')
    .alias('KH', { args: ['true'] }).alias('GH', { args: ['false'] })
    .action(async ({ session }, eState?) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      if (eState != undefined) config.event.enabled = !eState
      if (config.event.enabled) await session.send('红星活动已关闭\n输入PH查看排行\n输入CZHH重置红活')
      else {
        initRsEventTables()
        session.send('红星活动已开启\n输入HS7-12开始红活')
      }
      config.event.enabled = !config.event.enabled
    })

  ctx.command('PH', '查询红活排行')
    .action(async ({ session }) => {
      if (!(await isAdmin(session))) {
        session.send('无管理权限')
        return
      }
      let einfos = (await ctx.database.select('erank').where(row => $.gt(row.totalScore, config.event.minScore)).orderBy(row => row.totalScore, 'desc').execute())
      if (einfos[0] == undefined) {
        await session.sendQueued('未检索到红活排行信息')
        return
      }
      let tmp = [`-${config.event.name}红活榜单-`], index = 0
      for (const einfo of einfos) {
        let index2 = Math.floor(index / 15)
        tmp[index2] += `\n${++index}. ${await formatted_RsEvent(session, einfo.qid)}`
      }
      for (var i of tmp) {
        await session.sendQueued(i)
      }
    })

  ctx.command('CXHH [userId]', '查询红活分数')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId, true)
      let isInit = await isInitialized(session, qqid)
      if (!qqid || !isInit) return

      let einfos = (await ctx.database.select('erank').orderBy(row => row.totalScore, 'desc').execute())
      if (einfos[0] == undefined) {
        await session.sendQueued('未检索到红活排行信息')
        return
      }
      let eventOrder = einfos.findIndex(rsRank => rsRank.qid == qqid) + 1

      let einfo = await getEventInfo(qqid)
      if (!einfo) {
        session.send('未检索到玩家红活信息')
        return
      }
      let playerName = await getUserName(session, qqid)
      session.send(`${headMsg(session)}${userId ? playerName : ''}红活状态:\n╔ 当前次数: ${einfo.totalRuns}\n╠ 当前总分: ${einfo.totalScore}\n╚ 当前排行: ${eventOrder}${config.event.enabled ? '' : '\n——————————\n历史数据(红活未开启)'}`)
    })

  ctx.command('LRHH <lineNum> <eScore>', '录入红活分数')
    .action(async ({ session }, lineNum, eScore) => {
      if (!config.event.enabled) {
        session.send('红活已关闭,禁止录入')
        return
      }
      let runScore = Number.parseInt(eScore)
      if (isNaN(+lineNum) || isNaN(runScore)) {
        session.send('录入失败, 请检查指令\nLRHH 红活号码 红活分数')
        return
      }
      let einfo = await updateEventScore(session, +lineNum, runScore)
      if (einfo) {
        session.send(`红活录入成功\n————————————\n╔ 车队序号: ${+lineNum}\n╠ 当前次数: ${einfo.totalRuns}\n╠ 本轮等级: ${einfo.lineLevel}\n╠ 本轮分数: ${runScore}\n╚ 当前总分: ${einfo.totalScore}`)
      }
    })

  ctx.command('LH <eScore> <userId>', '管理补录红活分数')
    .action(async ({ session }, userId, eScore) => {
      if (!(await isSuper(session))) {
        session.send('录入失败, 无管理权限\nLRHH 红活号码 红活分数')
        return
      }
      let qqid = await getQQid(session, userId)
      if (!qqid) return

      let runScore = Number.parseInt(eScore)
      if (isNaN(runScore)) {
        session.send('录入失败, 请检查指令\nLH 玩家id 红活分数')
        return
      }
      let lineId = await join_rs_event(session, '6')
      let einfo = await updateEventScore(session, lineId, runScore, qqid)
      if (einfo != null) {
        session.send(`-\n${await getUserName(session, qqid)} 补录红活成功\n————————————\n╔ 车队序号: ${lineId}\n╠ 本轮等级: HS6\n╠ 当前次数: ${einfo.totalRuns}\n╠ 本轮分数: ${runScore}\n╚ 当前总分: ${einfo.totalScore}`)
      }
    })

  ctx.command('CZHH', '重置红活')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      session.send(`红活数据已${config.event.enabled ? '关闭并' : ''}重置`)
      config.event.enabled = false
      resetATable('elines')
      resetATable('erank')
      initRsEventTables()
    })

  ctx.command('备份', '生成备份')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      await generateBackup(session, root)
    })

  ctx.command('恢复备份 <fileName>', '恢复备份')
    .action(async ({ session }, fileName) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      await importBackup(session, path.join(root, 'backup'), fileName)
    })

  console.clear()

  async function join_drs(session: Session, joinType: string): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    console.log(`\n${qqid}: 尝试加入${joinType}队伍`)

    let pInfo = await getUserInfo(qqid)

    //检查是否可以排队
    let lineLevel = (+joinType.substring(1))
    if (pInfo.licence < lineLevel) {
      await session.send(`你未获得${joinType}车牌,请联系管理授权`)
      return
    }
    if (config.strictMode) { //严格模式检查更多的信息
      if (pInfo.cachedName == qqid) {
        await session.send(`请先录入游戏名\n例: LR名字 高语放歌`)
        return
      }
      if (pInfo.group == '无集团') {
        await session.send(`请先录入集团\n例: LR集团 巨蛇座`)
        return
      }
      if (pInfo.techs.every((tech) => tech === 0)) {
        await session.send(`请先录入科技\n例: LR科技 创1富2延3强4`)
        return
      }
    }

    let foundType = await findDrsFromId(session, qqid)
    if (foundType == 'K0') {
      await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType, waitDue: Date.now() + config.drsWaitTime }])
      let timer = await drs_timer(session, joinType)
      let dinfo = await findIdFromDrs(joinType)
      let lineNum = dinfo.length
      let lineMaximum = joinType.includes('K') ? 2 : 3
      var drs_message = `${session.onebot ? session.author.nick : ''} 成功加入${joinType}队伍\n————————————\n发车人数 [${lineNum}/${lineMaximum}]\n————————————\n${await formatted_DrsN(session, joinType, true)}————————————\n`

      //发车
      if (lineNum >= lineMaximum) {
        drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${joinType.substring(1)}  ]`
        //发车后清空队伍并更新场次
        for (const driverId of dinfo) {
          let tmp = (await ctx.database.get('players', { qid: driverId }))[0].playRoutes
          tmp[lineLevel - 7] += 1
          await ctx.database.upsert('players', (row) => [{ qid: driverId, playRoutes: tmp, latestLine: lineLevel }])
        }
        await ctx.database.remove('dlines', { lineType: joinType })
      }
      else drs_message += timer
      await session.send(drs_message)
      return
    }
    else if (foundType == joinType)
      await session.send(`${await getUserName(session, qqid)} 你已在${joinType}队伍中\n————————————\n${await formatted_DrsN(session, joinType)}————————————\n${await drs_timer(session, joinType)}`)
    else {
      await quit_drs(session)
      await join_drs(session, joinType)
    }
  }

  async function quit_drs(session: Session): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    let foundType = await findDrsFromId(session, qqid)
    if (foundType != 'K0') {
      await ctx.database.remove('dlines', { qid: qqid })
      await session.send(`${await getUserName(session, qqid)} 已退出${foundType}队列`)
    }
    else await session.send("你未在队伍中")
  }

  async function join_rs_event(session: Session, joinType: string): Promise<number> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    console.log(`\n${qqid}: 尝试加入${joinType}队伍`)
    //检查车牌
    let lineLevel = +joinType
    let licence = await getLicence(qqid)
    if (licence < lineLevel) {
      await session.send(`你未获得D${joinType}车牌,请联系管理授权`)
      return null
    }
    //开始红活单刷
    let foundType = await findDrsFromId(session, qqid)
    if (foundType == 'K0') {
      await ctx.database.create('elines', { qid: qqid, lineType: joinType })
      let dinfo = await ctx.database.get('elines', { qid: qqid }, ['lineId', 'runScore'])
      let lineNum = dinfo.length
      let lineId = dinfo[dinfo.length - 1].lineId + 1000
      let eventScore = 0
      let playerGroup = await getGroup(qqid)
      let einfo = await getEventInfo(qqid)
      if (dinfo && einfo) eventScore = einfo.totalScore
      var drs_message = `${session.onebot ? session.author.nick : ''} 加入HS${joinType}队伍\n————————————\n╔ [${playerGroup}]\n╠ 红活次数: ${lineNum}\n╠ 红活总分: ${eventScore}\n╚ 车队编号: ${lineId}\n————————————\nLRHH ${lineId} 得分`
      await session.send(drs_message)
      return dinfo[dinfo.length - 1].lineId
    }
    else {
      await quit_drs(session)
      await join_rs_event(session, joinType)
    }
  }

  async function updateEventScore(session: Session, lineId_in: number, score: number, playerId?: string): Promise<{ totalRuns: number, totalScore: number, lineLevel: string }> {
    let qqid: string, lineId = lineId_in - 1000
    if (playerId) qqid = playerId
    else qqid = await getQQid(session)
    if (!qqid) return

    let einfo = await ctx.database.get('elines', { qid: qqid, lineId: lineId })
    if (einfo[0] == undefined && playerId == undefined) {
      session.sendQueued('你不能录入别人的队列')
      return null
    }
    if (einfo[0].runScore != 0 && playerId == undefined) {
      session.sendQueued(`队列${lineId}不可重复录入`)
      return null
    }
    await ctx.database.upsert('erank', (row) => [{ qid: qqid, totalRuns: $.add(row.totalRuns, playerId == undefined ? 1 : 0), totalScore: $.add(row.totalScore, score) }])
    let scoreAfter = einfo[0].runScore + score
    await ctx.database.upsert('elines', (row) => [{ qid: qqid, lineId: lineId, runScore: scoreAfter }])
    let runAfter = (await ctx.database.get('erank', { qid: qqid }))[0].totalRuns
    return { totalRuns: runAfter, totalScore: scoreAfter, lineLevel: `HS${einfo[0].lineType}` }
  }

  async function findIdFromDrs(checkType: string): Promise<string[]> {
    let dinfo = await ctx.database.get('dlines', { lineType: checkType })
    if (dinfo[0] == undefined) return []
    let foundIdList = []
    dinfo.forEach(element => {
      foundIdList.push(element.qid)
    });
    return foundIdList
  }

  async function findWaitFromDrs(session: Session, checkType: string): Promise<string[]> {
    let dinfo = await ctx.database.get('dlines', { lineType: checkType })
    if (dinfo[0] == undefined) return []
    let foundTimeList: string[] = []
    for (const element of dinfo) {
      let waitTimeLeft = element.waitDue - Date.now()
      if (waitTimeLeft <= 0) {
        await ctx.database.remove('dlines', { qid: element.qid })
        await session.send(`${await getUserName(session, element.qid)} 超时被踢出${dinfo[0].lineType}队列`)
        continue
      }
      let formatted_time = `⏱️${Math.floor(waitTimeLeft / 6e4)}:${('' + Math.floor((waitTimeLeft % 6e4) / 1e3)).padStart(2, '0')} `
      foundTimeList.push(formatted_time)
    }
    return foundTimeList
  }

  async function findDrsFromId(session: Session, playerId: string): Promise<string> {
    let qqid = await getQQid(session, playerId)
    if (!qqid) return 'K0'

    let dinfo = await ctx.database.get('dlines', { qid: qqid })
    if (dinfo[0] == undefined) return 'K0'
    else if (Date.now() >= dinfo[0].waitDue) {
      await ctx.database.remove('dlines', { qid: qqid })
      await session.send(`${await getUserName(session, qqid)} 超时被踢出${dinfo[0].lineType}队列`)
      return 'K0'
    }
    else return dinfo[0].lineType
  }

  async function formatted_DrsN(session: Session, targetType: string, isTryAt?: boolean): Promise<string> {
    let targetNum = +targetType.substring(1) - 7
    let dinfo = await findIdFromDrs(targetType)
    if (dinfo.length == 0) return `${targetType}队列为空`
    let drs_message = ''
    for (const playerId of dinfo) {
      let pInfo = await getUserInfo(playerId)
      let playerName = await getUserName(session, playerId, isTryAt)
      drs_message += `╔ ${playerName}\n╠ [${pInfo.group}] ${pInfo.playRoutes[targetNum]}\n╚ [${formatted_Tech(pInfo.techs)}]\n`
    }
    return drs_message
  }

  async function formatted_RsEvent(session: Session, playerId: string, isDetail?: boolean): Promise<string> {
    let pInfo = await getUserInfo(playerId)
    let einfo = await getEventInfo(playerId)
    return isDetail ? `╔ 名称: ${pInfo.cachedName}\n╠ [${pInfo.group}]\n╠ 总分: ${einfo.totalScore}\n╚ 场次: ${einfo.totalRuns}` :
      `${await getUserName(session, playerId)}\n【总分:${einfo.totalScore} 场次:${einfo.totalRuns}】`
  }

  async function showAllLines(session: Session): Promise<string> {
    let linesMsg = ((!session.onebot) ? '-\n' : ''), dinfo: string[], timer: string
    for (var i = 7; i <= 12; i++) {
      timer = await drs_timer(session, `D${i}`)
      dinfo = await findIdFromDrs(`D${i}`)
      if (dinfo.length != 0) linesMsg += `D${i}队列—————\n${(await formatted_DrsN(session, `D${i}`))}${timer}\n`
      timer = await drs_timer(session, `K${i}`)
      dinfo = await findIdFromDrs(`K${i}`)
      if (dinfo.length != 0) linesMsg += `K${i}队列—————\n${(await formatted_DrsN(session, `K${i}`))}${timer}\n`
    }
    if (linesMsg == ((!session.onebot) ? '-\n' : '')) return '所有队列为空'
    else linesMsg += '————————\n其余队列为空'
    return linesMsg
  }

  async function showALine(session: Session, lineNum: number): Promise<string> {
    let lineMsg = ((!session.onebot) ? '-\n' : ''), dinfo: string[], timer: string
    timer = await drs_timer(session, `D${lineNum}`)
    dinfo = await findIdFromDrs(`D${lineNum}`)
    if (dinfo.length != 0) lineMsg += `D${lineNum}队列—————\n${(await formatted_DrsN(session, `D${lineNum}`))}${timer}\n`
    timer = await drs_timer(session, `K${lineNum}`)
    dinfo = await findIdFromDrs(`K${lineNum}`)
    if (dinfo.length != 0) lineMsg += `K${lineNum}队列—————\n${(await formatted_DrsN(session, `K${lineNum}`))}${timer}\n`
    if (!lineMsg.includes('队列')) lineMsg += `D${lineNum}/K${lineNum}队列为空`
    return lineMsg
  }

  async function getUserInfo(playerId: string): Promise<Pick<Players, 'qid' | 'licence' | 'playRoutes' | 'techs' | 'group' | 'cachedName'>> {
    return (await ctx.database.get('players', { qid: playerId }, ['qid', 'licence', 'playRoutes', 'techs', 'group', 'cachedName']))[0]
  }

  async function getEventInfo(playerId: string): Promise<Pick<RsEventRanking, 'totalRuns' | 'totalScore'>> {
    return (await ctx.database.get('erank', { qid: playerId }, ['totalRuns', 'totalScore']))[0]
  }

  async function getLicence(playerId: string): Promise<number> {
    return (await ctx.database.get('players', { qid: playerId }, ['licence']))[0].licence
  }

  async function getGroup(playerId: string): Promise<string> {
    return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
  }

  async function getUserName(session: Session, playerId?: string, isTryAt?: boolean): Promise<string> {
    if (session.onebot) {
      if (isTryAt) return `<at id="${playerId}",name="${playerId}">`
      if (!playerId) return session.author.nick
      return (await session.onebot.getGroupMemberInfo(session.guildId, playerId)).nickname
    }
    console.log(playerId)
    let qqid = await getQQid(session, playerId)
    if (!qqid) return null
    let playerName = (await ctx.database.get('players', { qid: playerId }, ['cachedName']))[0].cachedName
    return ((isTryAt ? '@' : '') + playerName)
  }

  async function formatted_playerdata(session: Session, playerId: string): Promise<string> {
    let isInit = await isInitialized(session, playerId)
    if (!isInit) return `玩家信息未初始化\n请使用CSH 指令自助初始化或联系管理\n${playerId}`
    let pInfo = await getUserInfo(playerId)
    let qqid = await getQQid(session, playerId)
    let openId = await findOpenIdFromQQid(qqid)
    let playerTech = formatted_Tech(pInfo.techs)
    let infoMsg = ((!session.onebot) ? '-\n' : '') + `玩家: ${pInfo.cachedName}`

    const infoMap: Record<MenuCX, () => string> = {
      [MenuCX.GROUP]: () => `\n集团: ${pInfo.group}`,
      [MenuCX.LICENCE]: () => `\n车牌: D${pInfo.licence}`,
      [MenuCX.ROUTES]: () => `\n场数: ${pInfo.playRoutes}`,
      [MenuCX.TECHS]: () => `\n科技: ${playerTech}`,
      [MenuCX.QQ_ID]: () => `\nQ Q: ${qqid}`,
      [MenuCX.OPEN_ID]: () => `\nOpenId: ${openId}`,
    }
    let mask = config.menuCX
    Object.entries(infoMap).forEach(([bitStr, generator]) => {
      const bit = Number(bitStr)
      if (mask & bit)
        infoMsg += generator()
    })
    return infoMsg
  }

  async function drs_timer(session: Session, targetType: string): Promise<string> {
    let timerList = await findWaitFromDrs(session, targetType)
    let tmp = '=>'
    for (const timer of timerList) {
      tmp += timer
    }
    if (timerList.length = 0) return ''
    return tmp
  }

  async function resetATable(tableName: any) {
    try {
      ctx.database.drop(tableName)
    }
    finally { }
  }

  async function getQQid(session: Session, userId?: string, noisy?: boolean): Promise<string> {
    let qqid: string
    if (!userId) {
      if (session.platform == 'onebot') return session.userId
      else {
        qqid = await findQQidFromOpenId(session.userId)
        if (!qqid && noisy) session.send(initMessage(session))
        return qqid
      }
    }
    if (session.platform == 'onebot') {
      let match = userId.match(/<at\s+[^>]*id="(\d+)"/)
      if (match && match[1] != undefined) return match[1]
      else if (!isNaN(+userId)) return userId
    }
    if (!isNaN(+userId)) qqid = await findQQidFromOpenId(await findOpenIdFromQQid(userId))
    else qqid = await findQQidFromOpenId(userId)
    if (!qqid && noisy) session.send(initMessage(session))
    return qqid
  }

  async function findOpenIdFromQQid(userId: string): Promise<string> {
    let dinfo = (await ctx.database.get('players', { qid: userId }, ['openId']))[0]
    if (!dinfo) return null
    return dinfo.openId
  }

  async function findQQidFromOpenId(openId: string): Promise<string> {
    let dinfo = (await ctx.database.get('players', { openId: openId }, ['qid']))[0]
    if (!dinfo) return null
    return dinfo.qid
  }

  async function isInitialized(session: Session, userId?: string): Promise<boolean> {
    if (session.onebot) return true
    let qqid = await getQQid(session, userId)
    return !!qqid
  }

  function initMessage(session: Session): string {
    return `请先自助初始化\n初始化指令用法:CSH (自己的QQ号)\n如有错误请联系管理员重置`
  }

  async function isAdmin(session: Session): Promise<boolean> {
    if (!config.admin.enabled) return true
    if (session.platform === 'qq') {
      let qqid = await getQQid(session)
      return config.admin.members.includes(session.userId) || config.admin.members.includes(qqid) || isSuper(session)
    }
    if (session.platform === 'onebot')
      return session.onebot?.sender?.role === 'owner' || session.onebot?.sender?.role === 'admin'
    return false
  }

  async function isSuper(session: Session): Promise<boolean> {
    if (!config.admin.enabled) return true
    if (session.platform === 'qq') {
      let qqid = await getQQid(session)
      return config.admin.super.includes(session.userId) || config.admin.super.includes(qqid)
    }
    if (session.platform === 'onebot')
      return session.onebot?.sender?.role === 'owner' || config.admin.super.includes(session.userId)
    return false
  }

  function validateTechs(arg: string): number[] {
    if (!arg) return null
    var result: number[] = []
    for (const keyword of ['创', '富', '延', '强']) {
      const match = arg.match(`${keyword}(\\d+)`)
      if (match && match[1] != undefined && isValidTechNum(+match[1])) {
        result.push(+match[1]);
      } else {
        return null
      }
    }
    return result
  }

  function formatted_Tech(techs: number[]): string {
    if (techs.every((tech) => tech === 0)) return '科技未录入'
    return `创${techs[0]}富${techs[1]}延${techs[2]}强${techs[3]}`
  }

  function headMsg(session: Session): string {
    return `${(session.qq) ? '-\n' : ''}`
  }

  async function saohuaTalk(session: Session) {
    if (!config.humor.enabled || Math.random() >= config.humor.chance || config.humor.talks.length == 0) return
    let saohua = config.humor.talks
    await session.sendQueued(saohua[Math.floor(Math.random() * saohua.length)])
  }

  async function generateBackup(session: Session, filePath: string): Promise<void> {
    await fs.mkdir(root, { recursive: true })
    const now = new Date()
    const fileName = `备份${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.json`
    try {
      const playersData = await ctx.database.get('players', {}, ['qid', 'licence', 'playRoutes', 'techs', 'group', 'cachedName'])
      const jsonContent = JSON.stringify(playersData, null, 2)
      await fs.writeFile(path.join(filePath, 'backup', fileName), jsonContent)
      session.send(`备份文件已保存至 ${fileName}`)
    } catch (error) {
      session.send(`备份操作失败`)
    }
  }

  async function importBackup(session: Session, filePath: string, fileName: string): Promise<void> {
    try {
      const fullPath = path.join(filePath, fileName)
      const fileContent = await fs.readFile(fullPath, 'utf-8')
      const playersData = JSON.parse(fileContent)

      await ctx.database.upsert('players', playersData)

      session.send(`成功恢复 ${playersData.length} 条记录`)
    } catch (error) {
      session.send(`备份恢复失败,已回滚`)
    }
  }
}

function isValidDrsNum(drs_num: number): boolean {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

function isValidTechNum(techNum: number): boolean {
  return !isNaN(techNum) && techNum >= 1 && techNum <= 15
}