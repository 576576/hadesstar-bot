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
  customLineLength: number
  strictMode: boolean
  templatesId: { rs2?: string, rs3?: string, drs_b?: string, event_b?: string, timeout?: string }
  humor: { enabled?: boolean, chance?: number, talks?: string[] }
  event: { enabled?: boolean, name?: string, cool?: number, minScore?: number, button?: boolean }
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
let event_cool: { [key: string]: number } = {}

export const Config: Schema<Config> = Schema.object({
  strictMode: Schema.boolean().default(false).description('严格模式: 未录入名字/集团/科技不可排队'),
  drsWaitTime: Schema.number()
    .default(18e5)
    .description('超时踢出前等待的时间 ms'),
  customLineLength: Schema.number()
    .default(0)
    .description('自定义队伍的默认长度'),
  menuCX: Schema.bitset(MenuCX)
    .default(MenuCX.GROUP | MenuCX.LICENCE | MenuCX.ROUTES | MenuCX.TECHS)
    .description('要在CX指令显示的菜单项'),
  templatesId: Schema.intersect([
    Schema.object({}).description('申请的qq开放平台模板id'),
    Schema.union([
      Schema.object({
        rs2: Schema.string().description('双人排队md模板id').default(''),
        rs3: Schema.string().description('三人排队md模板id').default(''),
        drs_b: Schema.string().description('暗红巨星按钮模板id').default(''),
        event_b: Schema.string().description('红星活动按钮模板id').default(''),
        timeout: Schema.string().description('超时提示md模板id').default(''),
      }),
      Schema.object({}),
    ])
  ]),
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
        enabled: Schema.boolean().description('开启红活').default(true).hidden(),
        name: Schema.string().description('红活集团名称').default(''),
        cool: Schema.number().description('红活加入冷却').default(3e5),
        minScore: Schema.number().description('红活最低分数').default(1e4),
        button: Schema.boolean().description('是否发送按钮').default(false),
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
  partners: string[]
}
export interface RsEventRanking {
  qid: string
  totalScore: number
  totalRuns: number
}

export function apply(ctx: Context, config: Config) {

  const root = path.join(ctx.baseDir, 'data', name)

  initPlayerTable()
  initDrsLines()
  initRsEventTables()

  function initPlayerTable() {
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
        initial: '',
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
        initial: null,
        nullable: false,
      },
      latestLine: {
        type: 'integer',
        initial: null,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })
  }

  function initDrsLines() {
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
        initial: 'S7',
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
        initial: 1000,
        nullable: false,
      },
      partners: {
        type: 'array',
        initial: [],
        nullable: false,
      }
    }, {
      primary: 'lineId',
      autoInc: true,
    })
    ctx.database.upsert('elines', [{ lineId: 999 }]) //令lineId从1000开始

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
    humor_talk(session)
  })

  ctx.command('PD', '按钮快捷排队')
    .action(async ({ session }) => {
      await send_button(session, false)
      await send_button(session, true)
    })

  ctx.command('CZHX', '重置所有玩家数据')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      // 重置players及dlines
      await drop_table('players')
      await drop_table('dlines')
      initPlayerTable()
      initDrsLines()
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
        session.send(`重置${userId}数据失败`)
      }
      session.send(`-\n已重置${userId}数据`)
    })

  ctx.command('XFDR', '清空队列')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      await drop_table('dlines')
      initDrsLines()
      session.send('已清除所有队列')
    })

  ctx.command('XF <arg>', '清空某一队列')
    .action(async ({ session }, arg) => {
      await quit_rs_type(session, arg)
    })

  ctx.command('XFZ <arg>', '清空自定义队列')
    .action(async ({ session }, _arg) => {
      let dinfo = await ctx.database.get('dlines', {}, ['lineType'])
      for (const player of dinfo) {
        if (!isBasicType(player.lineType)) await quit_rs_type(session, player.lineType, false)
      }
      session.send('已清除所有自定义队列')
    })

  ctx.command('cs')
    .action(async ({ session }) => {
      session.send('ok')
    })

  ctx.command('CSH <qid> [openId]', '初始化玩家数据')
    .action(async ({ session }, qid, openId?) => {
      let isInit = await init_status(session), qqid = await getQQid(session)
      if (!qid || isNaN(+qid)) {
        if (isInit) {
          await session.send('玩家已初始化,信息如下:\n' + await drs_player_info(session, qqid))
          return
        }
        else {
          session.send('初始化失败,请使用正确指令\nCSH (自己QQ号)')
          return
        }
      }
      let admin = await isAdmin(session)
      if (!!openId && !admin) {
        session.send('无管理权限')
        return
      }
      if (isInit && !admin) {
        await session.send('初始化失败\n玩家信息已初始化,如需更改请联系管理\n' + await drs_player_info(session, qqid))
        return
      }
      if (!openId) openId = session.userId
      await ctx.database.upsert('players', () => [{ qid: qid, openId: openId }])
      await session.send(`${openId}: 绑定了${qid}\n请先录入信息,如果使用过旧Bot则无需重新录入\n${await drs_player_info(session, qqid)}`)
    })

  ctx.command('R <arg>', '加入四人组队')
    .alias('R7', { args: ['7'] }).alias('R8', { args: ['8'] }).alias('R9', { args: ['9'] })
    .alias('R10', { args: ['10'] }).alias('R11', { args: ['11'] }).alias('R12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `R${(arg || '')}`)
    })
  ctx.command('D <arg>', '加入三人组队')
    .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
    .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `D${(arg || '')}`)
    })
  ctx.command('K <arg>', '加入双人组队')
    .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
    .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `K${(arg || '')}`)
    })
  ctx.command('S <arg>', '加入单人列队')
    .alias('S7', { args: ['7'] }).alias('S8', { args: ['8'] }).alias('S9', { args: ['9'] })
    .alias('S10', { args: ['10'] }).alias('S11', { args: ['11'] }).alias('S12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `S${(arg || '')}`)
    })
  ctx.command('HS <arg>', '加入单人红活')
    .alias('HS7', { args: ['7'] }).alias('HS8', { args: ['8'] }).alias('HS9', { args: ['9'] })
    .alias('HS10', { args: ['10'] }).alias('HS11', { args: ['11'] }).alias('HS12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `HS${(arg || '')}`)
    })
  ctx.command('HK <arg>', '加入双人红活')
    .alias('HK7', { args: ['7'] }).alias('HK8', { args: ['8'] }).alias('HK9', { args: ['9'] })
    .alias('HK10', { args: ['10'] }).alias('HK11', { args: ['11'] }).alias('HK12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `HK${(arg || '')}`)
    })
  ctx.command('HD <arg>', '加入三人红活')
    .alias('HD7', { args: ['7'] }).alias('HD8', { args: ['8'] }).alias('HD9', { args: ['9'] })
    .alias('HD10', { args: ['10'] }).alias('HD11', { args: ['11'] }).alias('HD12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      await join_rs(session, `HD${(arg || '')}`)
    })

  ctx.command('TC', '退出所有列队').action(async ({ session }) => (await quit_rs(session)))

  ctx.command('CK [arg]', '查询排队情况')
    .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
    .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      if (!arg) await session.send(await drs_lines(session))
      else if (valid_drs(+arg)) await session.send(await drs_line(session, +arg))
      else {
        let dinfo = await findDrsFromId(session, session.userId)
        if (!dinfo) {
          session.send('你暂无队列')
          return
        }
        await drs_timer(session, dinfo)
        dinfo = await findDrsFromId(session, session.userId)
        dinfo ? session.send(`你在${dinfo}队列中`) : null
      }
    })

  ctx.command('CX [userId]', '查询玩家信息')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId)
      session.send(await drs_player_info(session, qqid))
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

      let techs_in: number[] = validate_tech(techString)
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
      let isInit = await init_status(session, qqid)
      if (!qqid || !isInit) return

      let licenceNum = +(licence.substring(1))
      if (!valid_drs(licenceNum) && licenceNum != 6) {
        await session.send('请授予正确车牌D7-12,或D6以撤销车牌')
        return
      }
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
      if (eState !== undefined) config.event.enabled = !!eState
      else config.event.enabled = !config.event.enabled
      if (!config.event.enabled)
        await session.send(`红星活动已关闭\n输入PH查看排行\n输入CZHH重置红活\n${await show_event_result()}`)
      else {
        initRsEventTables()
        session.send('红星活动已开启\n输入HS7-12开始红活')
      }
    })

  ctx.command('PH [arg]', '查询红活排行')
    .action(async ({ session }, arg) => {
      show_event_rank(session, arg)
    })

  ctx.command('CXHL <userId>')
    .action(async ({ session }, userId) => {
      if (!userId) userId = await getQQid(session)
      show_event_history(session, userId)
    })

  ctx.command('CXHJ')
    .action(async ({ session }) => {
      if (!(await isAdmin(session))) {
        session.send('无管理权限')
        return
      }
      session.send(`红活统计\n${await show_event_result()}`)
    })

  ctx.command('CXHH [userId]', '查询红活分数')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId, true)
      let isInit = await init_status(session, qqid)
      if (!qqid || !isInit) return

      let einfos = (await ctx.database.select('erank').orderBy(row => row.totalScore, 'desc').execute())
      if (!einfos[0]) {
        session.send('未检索到红活排行信息')
        return
      }
      let eventOrder = einfos.findIndex(rsRank => rsRank.qid == qqid) + 1

      let einfo = await getRankInfo(qqid)
      if (!einfo) {
        session.send('未检索到玩家红活信息')
        return
      }
      let playerName = await getUserName(session, qqid)
      session.send(`${head_msg(session)}玩家: ${playerName}\n╠ 当前次数: ${einfo.totalRuns}\n╠ 当前总分: ${einfo.totalScore}\n╚ 当前排行: ${eventOrder}${config.event.enabled ? '' : '\n——————————\n历史数据(红活未开启)'}`)
    })

  ctx.command('LRHH <lineNum_or_score> <score>', '录入红活分数')
    .action(async ({ session }, lineNum_or_score, score?) => {

      if (await validate([
        () => (!config.event.enabled && (session.send('红活已关闭,禁止录入'), true)),
        () => (isNaN(+lineNum_or_score) && (session.send(`录入失败, 请检查指令\nLRHH 红活号码 红活分数`), true)),
        () => (+lineNum_or_score > 9e4 || +score > 9e4 && (session.send('录入失败, 分数异常过高'), true))
      ])) return

      let einfo = await record_event(session, +lineNum_or_score, +score)
      if (einfo) {
        session.send(`红活录入成功\n———————————\n╔ 车队序号: ${einfo.lineId}\n╠ 本轮等级: ${einfo.lineLevel}\n╠ 当前次数: ${einfo.totalRuns}\n╠ 本轮分数: ${einfo.runScore}\n╚ 当前总分: ${einfo.totalScore}`)
      }
    })

  ctx.command('LH <arg:text>', '管理补录红活分数')
    .action(async ({ session }, arg) => {
      if (!(await isSuper(session))) {
        session.send('录入失败, 无管理权限\nLRHH 红活号码 红活分数')
        return
      }
      let [userId, score] = arg.split(' ')
      let qqid = await getQQid(session, userId)
      if (!qqid) return

      let runScore = Number.parseInt(score)
      if (isNaN(runScore)) {
        session.send('录入失败, 请检查指令\nLH 玩家id 红活分数')
        return
      }
      let einfo = await record_event(session, +qqid, runScore)
      if (!!einfo) {
        session.send(`-\n${await getUserName(session, qqid, true)} 补录红活成功\n———————————\n╔ 本轮等级: ${einfo.lineLevel}\n╠ 当前次数: ${einfo.totalRuns}\n╠ 本轮分数: ${runScore}\n╚ 当前总分: ${einfo.totalScore}`)
      }
      else session.send('补录失败')
    })

  ctx.command('CZHH', '重置红活')
    .action(async ({ session }) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      session.send(`红活${config.event.enabled ? '已关闭并' : '数据已'}重置`)
      config.event.enabled = false
      await drop_table('elines')
      await drop_table('erank')
      initRsEventTables()
      event_cool = {}
    })

  ctx.command('备份 [fileName]', '生成备份')
    .action(async ({ session }, fileName) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      const now = new Date()
      if (!fileName) fileName = `备份${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.json`
      await generateBackup(session, path.join(root, 'backup'), fileName)
    })

  ctx.command('恢复备份 <fileName>', '恢复备份')
    .action(async ({ session }, fileName) => {
      if (!(await isSuper(session))) {
        session.send('无红名单权限')
        return
      }
      await importBackup(session, path.join(root, 'backup'), fileName)
    })

  async function join_rs(session: Session, joinType: string): Promise<number> {
    let isInit = await init_status(session)
    if (!isInit) {
      session.send(init_msg(session))
      return null
    }
    let qqid = await getQQid(session)

    let joinInfo = parseJoinType(joinType), lineId: number = null
    if (!joinInfo || joinInfo.lineCapacity <= 0) return
    const lineMax = joinInfo.lineCapacity
    if (!joinInfo.lineLevel) {
      try {
        joinInfo.lineLevel = (await ctx.database.get('players', { qid: qqid }))[0].latestLine
        joinType = joinInfo.lineType + joinInfo.lineLevel
      } catch (error) {
        await ctx.database.upsert('players', (row) => [{ qid: qqid, latestLine: row.licence }])
        session.send('未查询到上一次排队等级,已记录为车牌等级\n下次可/D 一键快捷排队')
        return null
      }
    }

    let player = (await getUserInfo(qqid))[0]

    //检查是否可以排队
    let check_msg = head_msg(session)
    if (await validate([
      () => (!valid_drs(joinInfo.lineLevel) && (check_msg += `暗红星等级为7-12,请输入正确等级\n`, true)),
      () => (player.licence < joinInfo.lineLevel && (check_msg += `你未获得${joinType}车牌,请联系管理授权\n`, true)),
      () => (player.cachedName == null && (check_msg += '请先录入游戏名\n例: LR名字 高语放歌\n', true))
    ])) {
      session.send(check_msg.trim())
      return null
    }

    //严格模式检查更多信息
    if (config.strictMode && await validate_all([
      () => (player.group == null && (check_msg += '请先录入集团\n例: LR集团 巨蛇座\n', true)),
      () => (player.techs.every(t => !t) && (check_msg += '请先录入科技\n例: LR科技 创1富2延3强4\n', true))
    ])) {
      check_msg += '管理员已启用严格模式,信息不全禁止排队'
      session.send(check_msg.trim())
      return null
    }

    //红活模式检查更多信息
    if (joinInfo.isEvent && await validate([
      () => (!config.event.enabled && (check_msg = `红活未开启,禁止加入\n`, true)),
      () => ((qqid in event_cool) && event_cool[qqid] > Date.now() && (check_msg = `红活加入冷却: ${event_timer(qqid)}\n`, true))
    ])) {
      session.send(check_msg.trim())
      return null
    }

    //开始暗红星/红活队列
    let timer = await drs_timer(session, joinType)
    let foundType = await findDrsFromId(session, qqid)
    if (!foundType) {
      let info_msg: string, drs_msg: string
      if (lineMax == 1) {
        //单人发车
        info_msg = joinInfo.isEvent ?
          (await event_player_info(session, qqid, true)) :
          (await drs_player_info(session, qqid, false, joinInfo.lineLevel))
        drs_msg = `${await head_name(session, qqid)} 加入${joinType}队伍\n———————————\n${info_msg}———————————\n`
        if (joinInfo.isEvent) lineId = await create_event_line([qqid], joinType)
        if (joinInfo.isEvent && config.event.button) await send_button(session, true)

        await session.send(drs_msg + end_msg(joinInfo.lineLevel, lineId))
        await ctx.database.upsert('players', () => [{ qid: qqid, latestLine: joinInfo.lineLevel }])
        return lineId
      }
      await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType, waitDue: Date.now() + config.drsWaitTime }])
      let dinfo = await findIdFromDrs(joinType)
      let lineNum = dinfo.length
      info_msg = joinInfo.isEvent ?
        (await event_players_info(session, joinType, true)) :
        (await drs_players_info(session, joinType, true))
      drs_msg = `${await head_name(session, qqid)} 加入${joinType}队伍${format_dr_count(lineNum, lineMax)}\n———————————\n${info_msg}———————————\n`

      //多人发车
      timer = await drs_timer(session, joinType)
      if (lineNum >= lineMax) {
        //发车后清空队伍并更新场次
        if (joinInfo.isEvent) lineId = await create_event_line(dinfo, joinType)
        await send_msg_launch(session, joinType, lineId, dinfo, drs_msg)

        for (const playerId of dinfo) {
          let tmp = (await ctx.database.get('players', { qid: playerId }))[0].playRoutes
          tmp[joinInfo.lineLevel - 7] += 1
          await ctx.database.upsert('players', (_row) => [{ qid: playerId, playRoutes: tmp, latestLine: joinInfo.lineLevel }])
        }
        await ctx.database.remove('dlines', { lineType: joinType })
      }
      else await session.send(drs_msg + timer)
      return lineId
    }
    else if (foundType == joinType) {
      let info_msg = joinInfo.isEvent ? await event_players_info(session, joinType, true) : await drs_players_info(session, joinType, true)
      session.send(`你已在${joinType}队伍中\n———————————\n${info_msg}———————————\n${timer}`)
    }

    else {
      await quit_rs(session)
      await join_rs(session, joinType)
    }
  }

  async function quit_rs(session: Session): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    let foundType = await findDrsFromId(session, qqid)
    if (!!foundType) {
      await ctx.database.remove('dlines', { qid: qqid })
      await session.send(`已退出${foundType}队列`)
    }
    else await session.send("你未在队伍中")
  }

  async function quit_rs_type(session: Session, quitType: string, noisy: boolean = true): Promise<void> {
    let qqid = await getQQid(session)
    if (!qqid) return
    if (!(await isAdmin(session))) {
      session.send('无管理权限')
      return
    }
    let foundIdList = await findIdFromDrs(quitType)
    if (!foundIdList[0]) {
      noisy ? session.send(`${quitType}队列为空`) : null
      return
    }
    for (const playerId of foundIdList) {
      await ctx.database.remove('dlines', { qid: playerId })
      let d_msg = `${head_msg(session)}${await getUserName(session, playerId)} 已退出${quitType}队列`
      await session.send(d_msg)
    }
    noisy ? session.send(`已清除${quitType}队列`) : null
  }

  async function create_event_line(players: string[], joinType: string): Promise<number> {
    let qqid = players[0], partners = players.slice(1)
    let einfo = await ctx.database.create('elines', { qid: qqid, lineType: joinType, partners: partners })
    for (const player of players) {
      event_cool[player] = Date.now() + config.event.cool
    }

    return einfo.lineId
  }

  async function record_event(session: Session, lineId_score_playerId: number, score?: number): Promise<{ totalRuns: number, totalScore: number, runScore: number, lineLevel: string, lineId: number }> {
    let qqid = await getQQid(session), einfo: RsEventLines[], lineId = lineId_score_playerId
    if (!qqid) return

    if (lineId_score_playerId > 8e6 && !isNaN(score) && isAdmin(session)) {
      //管理员直接录入
      qqid = await getQQid(session, '' + lineId_score_playerId)
      einfo = [(await ctx.database.create('elines', { qid: qqid, lineType: 'HP12', runScore: score }))]
      lineId = einfo[0].lineId
    }
    else if (!isNaN(lineId) && isNaN(score) && lineId > 3000) {
      //缺省队列号模式
      score = lineId_score_playerId
      einfo = await ctx.database.get('elines', { qid: qqid, runScore: { $lte: 1 } })
      if (!einfo[0]) {
        session.send('未找到红活队列,不可录入')
        return null
      }
      lineId = einfo[0].lineId
    }
    else if (!isNaN(lineId) && !isNaN(score)) {
      //正常录入模式
      einfo = await ctx.database.get('elines', { lineId: lineId })
      if (!einfo[0]) {
        session.send('无效红活队列,不可录入\n或多人红活组队不支持缺省队伍号录入')
        return null
      }
      else if (einfo[0].qid != qqid && !einfo[0].partners.includes(qqid) && !(await isSuper(session))) {
        session.send('不可录入他人队列')
        return null
      }
      if (einfo[0].runScore > 0) {
        if (!(await isSuper(session))) {
          session.send(`队列${lineId}不可重复录入`)
          return null
        }
        session.send(`覆盖录入成功\n队列序号: ${lineId}\n改前分数: ${einfo[0].runScore}\n改后分数: ${score}`)
      }
    }
    else {
      session.send('录入失败, 无管理权限\nLRHH 红活号码 红活分数')
      return null
    }

    let pInfo = []
    if (!!einfo[0].partners) {
      score = Math.ceil(score / (einfo[0].partners.length + 1))
      for (const partner of einfo[0].partners) {
        pInfo.push({ qid: partner, lineId: lineId, runScore: score })
      }
    }
    pInfo.push({ qid: einfo[0].qid, lineId: lineId, runScore: score })

    await ctx.database.upsert('erank', (row) => [{ qid: einfo[0].qid, totalRuns: $.add(row.totalRuns, 1), totalScore: $.add(row.totalScore, score) }])
    if (!!einfo[0].partners) {
      for (const partner of einfo[0].partners) {
        await ctx.database.upsert('erank', (row) => [{ qid: partner, totalRuns: $.add(row.totalRuns, 1), totalScore: $.add(row.totalScore, score) }])
      }
    }
    await ctx.database.upsert('elines', pInfo)
    let rinfo = (await ctx.database.get('erank', { qid: qqid }))[0]
    return { totalRuns: rinfo.totalRuns, totalScore: rinfo.totalScore, runScore: score, lineLevel: einfo[0].lineType, lineId: lineId }
  }

  async function show_event_rank(session: Session, minScore_or_rank: string): Promise<void> {
    if (!(await isAdmin(session))) {
      session.send('无管理权限')
      return
    }
    let minScore = config.event.minScore, minRank = 0
    if (!isNaN(+minScore_or_rank)) {
      if (+minScore_or_rank > 200) minScore = +minScore_or_rank
      else if (+minScore_or_rank > 0) minRank = +minScore_or_rank
    }
    let einfos = await ctx.database.select('erank').where(row => $.gt(row.totalScore, minScore)).orderBy(row => row.totalScore, 'desc').execute()
    if (minRank != 0) einfos = einfos.slice(0, minRank)
    await session.sendQueued(`${config.event.name}红活榜\n分数阈值: ${minScore}${!minRank ? '' : '\n排名阈值: ' + minRank}\n${await show_event_result()}`)
    if (!einfos[0]) {
      await session.sendQueued('未检索到红活排行信息')
      return
    }
    let h_msg = head_msg(session)
    let tmp: string[] = ['', '', '', '', ''], index = 0
    for (const einfo of einfos) {
      let index2 = Math.floor(index / 15)
      tmp[index2] += `${++index}. ${await event_player_info(session, einfo.qid)}\n`
    }
    for (var i of tmp) {
      if (!i.length) continue
      await session.sendQueued(h_msg + i.trim())
    }
  }

  async function show_event_history(session: Session, playerId_or_lineId: string): Promise<void> {
    if (!(await isAdmin(session))) {
      session.send('无管理权限')
      return
    }
    if (!playerId_or_lineId) return
    if (+playerId_or_lineId < 8e6) {
      try {
        let dinfo = (await ctx.database.get('elines', { lineId: +playerId_or_lineId }))[0]
        session.send(`${head_msg(session)}车队序号: ${dinfo.lineId}\n本轮等级: ${dinfo.lineType}\n本轮分数: ${dinfo.runScore}\n本轮成员:${dinfo.qid} ${(dinfo.partners || '')}`)
        return
      } catch (error) {
        session.send('未找到红活队列')
        return
      }
    }
    let playerId = playerId_or_lineId
    let einfos = await ctx.database.get('elines', { $or: [{ qid: { $eq: playerId } }, { partners: { $el: playerId } }] })
    einfos = einfos.sort(row => row.lineId)
    let h_msg = head_msg(session)
    for (const einfo of einfos) {
      h_msg += `【场次${einfo.lineId} ${einfo.lineType} 分数${einfo.runScore}】\n`
    }
    session.send(h_msg.trim())
  }

  async function show_event_result(): Promise<string> {
    let players = await ctx.database.get('erank', {}, ['totalScore'])
    let totalScore = 0
    for (const player of players) totalScore += player.totalScore
    return `红活总分: ${totalScore}\n红活人数: ${players.length}`
  }

  async function findIdFromDrs(checkType: string): Promise<string[]> {
    let players = await ctx.database.get('dlines', { lineType: checkType })
    if (!players[0]) return []
    let foundIdList = []
    for (const player of players) {
      foundIdList.push(player.qid)
    }
    return foundIdList
  }

  async function findWaitFromDrs(session: Session, checkType: string): Promise<string[]> {
    let players = await ctx.database.get('dlines', { lineType: checkType })
    if (!players[0]) return []
    let foundTimeList: string[] = []
    for (const player of players) {
      let waitTimeLeft = player.waitDue - Date.now()
      if (waitTimeLeft <= 0) {
        await ctx.database.remove('dlines', { qid: player.qid })
        await send_msg_timeout(session, checkType, player.qid)
        continue
      }
      else {
        let timer = format_time(waitTimeLeft)
        foundTimeList.push(timer)
      }
    }
    return foundTimeList
  }

  const format_time = (ms: number) =>
    `⏱️${Math.floor(ms / 6e4)}:${Math.floor((ms % 6e4) / 1e3).toString().padStart(2, '0')} `

  async function findDrsFromId(session: Session, playerId: string): Promise<string> {
    let qqid = await getQQid(session, playerId)
    if (!qqid) return null

    let dinfo = await ctx.database.get('dlines', { qid: qqid })
    return dinfo[0] ? dinfo[0].lineType : null
  }

  async function drs_players_info(session: Session, targetType: string, isTryAt?: boolean): Promise<string> {
    let d_level = parseJoinType(targetType).lineLevel - 7
    let playersId = await findIdFromDrs(targetType)
    if (!playersId.length) return `${targetType}队列为空`
    let d_msg = '', player: Players, players = await getUserInfo(playersId), playerName: string
    for (var i = 0; i < playersId.length; i++) {
      player = players[i]
      playerName = await getUserName(session, player.qid, isTryAt)
      d_msg += `${style_num(i + 1)}${playerName}\n  [${player.group}] ${player.playRoutes[d_level]}\n  [${style_tech(player.techs)}]\n`
    }
    return d_msg
  }

  async function event_players_info(session: Session, targetType: string, isTryAt?: boolean): Promise<string> {
    let playersId = await findIdFromDrs(targetType)
    if (!playersId.length) return `${targetType}队列为空`
    let d_msg = '', player: Players, players = await getUserInfo(playersId), playerName: string
    for (var i = 0; i < playersId.length; i++) {
      player = players[i]
      playerName = await getUserName(session, player.qid, isTryAt)
      let einfo = await getRankInfo(player.qid)
      d_msg += `${style_num(i + 1)}${playerName}\n  [${player.group}] ${einfo.totalRuns}\n  总分: ${einfo.totalScore}\n`
    }
    return d_msg
  }

  async function drs_player_info(session: Session, playerId: string, detail: boolean = true, lineLevel?: number): Promise<string> {
    let isInit = await init_status(session, playerId)
    if (!isInit || !playerId) return '未检索到玩家信息\n或玩家未初始化'
    let player = (await getUserInfo(playerId))[0]
    if (!player) return '未检索到玩家信息'
    let playerTech = style_tech(player.techs)
    if (!detail) return `@${player.cachedName}\n  [${player.group}] ${player.playRoutes[lineLevel - 7]}\n  [${playerTech}]\n`
    let infoMsg = ((!session.onebot) ? '-\n' : '') + `玩家: ${player.cachedName}`

    const infoMap: Record<MenuCX, () => string> = {
      [MenuCX.GROUP]: () => `\n集团: ${player.group}`,
      [MenuCX.LICENCE]: () => `\n车牌: D${player.licence}`,
      [MenuCX.ROUTES]: () => `\n场数: ${player.playRoutes}`,
      [MenuCX.TECHS]: () => `\n科技: ${playerTech}`,
      [MenuCX.QQ_ID]: () => `\nQ Q: ${player.qid}`,
      [MenuCX.OPEN_ID]: () => `\nOpenId: ${player.openId ? player.openId : 'null'}`,
    }
    let mask = config.menuCX
    Object.entries(infoMap).forEach(([bitStr, generator]) => {
      const bit = Number(bitStr)
      if (mask & bit)
        infoMsg += generator()
    })
    return infoMsg
  }

  async function event_player_info(session: Session, playerId: string, detail: boolean = false): Promise<string> {
    let dinfo = (await getUserInfo(playerId))[0]
    let einfo = await getRankInfo(playerId)
    return detail ? `玩家: ${dinfo.cachedName}\n  [${dinfo.group}] ${einfo.totalRuns}\n  当前总分: ${einfo.totalScore}\n` :
      `${await getUserName(session, playerId)}\n【总分:${einfo.totalScore} 场次:${einfo.totalRuns}】`
  }

  async function drs_lines(session: Session): Promise<string> {
    let linesMsg = ((!session.onebot) ? '-\n' : ''), players: string[], timer: string
    for (var i = 7; i <= 12; i++) {
      timer = await drs_timer(session, `D${i}`)
      players = await findIdFromDrs(`D${i}`)
      if (players.length != 0) linesMsg += `D${i}队列——————\n${(await drs_players_info(session, `D${i}`))}${timer}\n`
      timer = await drs_timer(session, `K${i}`)
      players = await findIdFromDrs(`K${i}`)
      if (players.length != 0) linesMsg += `K${i}队列——————\n${(await drs_players_info(session, `K${i}`))}${timer}\n`
    }
    if (linesMsg == ((!session.onebot) ? '-\n' : '')) return '所有队列为空'
    else linesMsg += '—————————\n其余队列为空'
    return linesMsg
  }

  async function drs_line(session: Session, lineNum: number): Promise<string> {
    let lineMsg = ((!session.onebot) ? '-\n' : ''), dinfo: string[], timer: string
    timer = await drs_timer(session, `D${lineNum}`)
    dinfo = await findIdFromDrs(`D${lineNum}`)
    if (dinfo.length != 0) lineMsg += `D${lineNum}队列——————\n${(await drs_players_info(session, `D${lineNum}`))}${timer}\n`
    timer = await drs_timer(session, `K${lineNum}`)
    dinfo = await findIdFromDrs(`K${lineNum}`)
    if (dinfo.length != 0) lineMsg += `K${lineNum}队列——————\n${(await drs_players_info(session, `K${lineNum}`))}${timer}\n`
    if (!lineMsg.includes('队列')) lineMsg += `D${lineNum}/K${lineNum}队列为空`
    return lineMsg
  }

  async function getUserInfo(playerId: string | string[]): Promise<Players[]> {
    try {
      return (await ctx.database.get('players', playerId))
    } catch (error) {
      return null
    }
  }

  async function getRankInfo(playerId: string): Promise<Pick<RsEventRanking, 'totalRuns' | 'totalScore'>> {
    return (await ctx.database.get('erank', playerId, ['totalRuns', 'totalScore']))[0] || { totalRuns: 0, totalScore: 0 }
  }

  async function getUserName(session: Session, playerId?: string, isTryAt?: boolean): Promise<string> {
    if (session.onebot) {
      if (isTryAt) return `<at id="${playerId}",name="${playerId}">`
      if (!playerId) return session.author.nick
      return (await session.onebot.getGroupMemberInfo(session.guildId, playerId)).nickname
    }
    let qqid = await getQQid(session, playerId)
    if (!qqid) return null
    let playerName = (await ctx.database.get('players', { qid: playerId }, ['cachedName']))[0].cachedName
    return ((isTryAt ? '@' : '') + playerName)
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

  function event_timer(playerId: string): string {
    return format_time(event_cool[playerId] - Date.now())
  }

  async function drop_table(tableName: any): Promise<void> {
    try {
      await ctx.database.drop(tableName)
    }
    finally { }
  }

  async function getQQid(session: Session, userId?: string, noisy?: boolean): Promise<string> {
    let qqid: string
    if (!userId) {
      if (session.platform == 'onebot') return session.userId
      else {
        qqid = await findQQidFromOpenId(session.userId)
        if (!qqid && noisy) session.send(init_msg(session))
        return qqid
      }
    }
    if (session.platform == 'onebot') {
      let match = userId.match(/<at\s+[^>]*id="(\d+)"/)
      if (match && match[1] != undefined) return match[1]
      else if (!isNaN(+userId)) return userId
    }
    if (!isNaN(+userId)) return userId
    else qqid = await findQQidFromOpenId(userId)
    if (!qqid && noisy) session.send(init_msg(session))
    return qqid
  }

  async function findOpenIdFromQQid(userId: string): Promise<string> {
    let dinfo = (await ctx.database.get('players', { qid: userId }, ['openId']))[0]
    return dinfo ? dinfo.openId : null
  }

  async function findQQidFromOpenId(openId: string): Promise<string> {
    let dinfo = (await ctx.database.get('players', { openId: openId }, ['qid']))[0]
    return dinfo ? dinfo.qid : null
  }

  async function init_status(session: Session, userId?: string): Promise<boolean> {
    if (session.onebot) return true
    if (!userId) userId = session.userId
    if (!isNaN(+userId)) {
      let openId = await findOpenIdFromQQid(userId)
      return !!openId
    }
    let qqid = await findQQidFromOpenId(userId)
    return !!qqid
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

  async function send_button(session: Session, isEvent: boolean): Promise<boolean> {
    let templateId = isEvent ? config.templatesId.event_b : config.templatesId.drs_b
    if (!templateId) return false
    try {
      await session.qq.sendMessage(session.channelId, {
        content: '快捷排队',
        msg_type: 2,
        msg_id: session.messageId,
        keyboard: {
          id: templateId
        },
      })
    } catch (error) {
      return false
    }
    return true
  }

  async function send_msg_launch(session: Session, lineType: string, lineId: number, players: string[], drs_msg: string): Promise<boolean> {
    let isEvent = !!lineId, launchInfo = parseJoinType(lineType)
    if (!session.qq || !config.templatesId.rs2) {
      await session.send(drs_msg + end_msg(launchInfo.lineLevel, lineId))
      return true
    }
    let end_info = end_tips(launchInfo.lineLevel, lineId)
    let openIds: string[] = [], templateId: string, userId3: { key: string; values: string[] }, userInfo3: { key: string; values: string[] }
    for (const player of players) {
      let openId = await findOpenIdFromQQid(player)
      if (openId) openIds.push(openId)
    }
    if (players.length < 3) {
      templateId = config.templatesId.rs2
      userId3 = null, userInfo3 = null
    }
    else {
      templateId = config.templatesId.rs3
      userId3 = { key: 'userId3', values: [openIds[2]] }
      userInfo3 = { key: 'userInfo3', values: [await playerInfo_md(isEvent, players[2])] }
    }
    try {
      await session.qq.sendMessage(session.channelId, {
        content: '',
        msg_type: 2,
        msg_id: session.messageId,
        markdown: {
          custom_template_id: templateId,
          params: [
            { key: 'lineType', values: [lineType] },
            { key: 'userId1', values: [openIds[0]] },
            { key: 'userInfo1', values: [await playerInfo_md(isEvent, players[0])] },
            { key: 'userId2', values: [openIds[1]] },
            { key: 'userInfo2', values: [await playerInfo_md(isEvent, players[1])] },
            userId3, userInfo3,
            { key: 'tip1', values: [end_info.tip1] },
            { key: 'tip2', values: [end_info.tip2] },
            { key: 't1', values: [end_info.t1] },
          ]
        },
        keyboard: {
          id: isEvent ? config.templatesId.event_b : config.templatesId.drs_b
        },
      })
    }
    catch (error) {
      await session.send(drs_msg + end_msg(launchInfo.lineLevel, lineId))
      return false
    }
    return true
  }

  async function send_msg_timeout(session: Session, lineType: string, player: string): Promise<boolean> {
    if (!session.qq || !config.templatesId.timeout) {
      await session.send(`${head_msg(session)}${await getUserName(session, player, true)} 超时被踢出${lineType}队列`)
      return true
    }
    let templateId = config.templatesId.timeout
    let openId = await findOpenIdFromQQid(player)
    try {
      await session.qq.sendMessage(session.channelId, {
        content: '',
        msg_type: 2,
        msg_id: session.messageId,
        markdown: {
          custom_template_id: templateId,
          params: [
            { key: 'userId', values: [openId] },
            { key: 'lineType', values: [lineType] },
          ]
        },
      })
    }
    catch (error) {
      await session.send(`${head_msg(session)}${await getUserName(session, player, true)} 超时被踢出${lineType}队列`)
      return false
    }
    return true
  }

  async function playerInfo_md(isEvent: boolean, playerId: string): Promise<string> {
    if (isEvent) {
      let player = await getRankInfo(playerId)
      return `[${player.totalScore}] ${player.totalRuns}`
    }
    let player = (await getUserInfo(playerId))[0]
    return `[${style_tech(player.techs)}] ${player.playRoutes[0]}`
  }

  async function humor_talk(session: Session) {
    if (!config.humor.enabled || Math.random() >= config.humor.chance || config.humor.talks.length == 0) return
    let saohua = config.humor.talks
    await session.sendQueued(saohua[Math.floor(Math.random() * saohua.length)])
  }

  async function generateBackup(session: Session, filePath: string, fileName: string): Promise<void> {
    try {
      const fullPath = path.join(filePath, fileName)
      const playersData = await ctx.database.get('players', {})
      const jsonContent = JSON.stringify(playersData, null, 2)
      await fs.writeFile(fullPath, jsonContent)
      session.send(`备份文件已保存至 ${fileName}`)
    } catch (error) {
      session.send(`备份操作失败`)
    }
  }

  async function importBackup(session: Session, filePath: string, fileName: string): Promise<void> {
    try {
      const fullPath = path.join(filePath, fileName)
      const jsonContent = await fs.readFile(fullPath, 'utf-8')
      const playersData = JSON.parse(jsonContent)
      await ctx.database.upsert('players', playersData)
      session.send(`成功恢复 ${playersData.length} 条记录`)
    } catch (error) {
      session.send(`备份恢复失败,已尝试回滚`)
    }
  }

  function parseJoinType(rawJoinType: string): { isEvent: boolean; lineType: string; lineLevel: number, lineCapacity: number } {
    const match = rawJoinType.match(/^([hH]?)([\u4e00-\u9fa5a-zA-Z_]*?)(\d*)$/)
    if (!match) return null
    const [, hPrefix, typePart, rawLevel] = match
    const lineLevel = rawLevel ? parseInt(rawLevel, 10) : null
    const baseType = typePart
    const capacityKey = baseType?.toUpperCase() || '自定义'
    return {
      isEvent: !!hPrefix,
      lineType: (hPrefix + typePart).trim() || 'S',
      lineLevel: isNaN(lineLevel!) ? null : lineLevel,
      lineCapacity: { R: 4, D: 3, K: 2, S: 1 }[capacityKey] ?? config.customLineLength
    }
  }

  function end_tips(lineLevel: number, lineId?: number): { tip1: string, tip2: string, t1: string } {
    let tip1 = lineId ? `录分: LRHH ${lineId} 分数` : '小号若已进入请提前说明'
    let tip2 = lineId ? `集合地点: ${config.event.name ? config.event.name : '红活团未指定'}` : '集合默认BSO无加成顺延'
    let t1 = lineId ? `编号🔥 ${lineId} ` : `口令🔰  A${lineLevel} `
    return { tip1: tip1, tip2: tip2, t1: t1 }
  }

  const head_name = async (session: Session, playerId: string): Promise<string> =>
    session.qq ? '' : await getUserName(session, playerId, true)

  const end_msg = (lineLevel: number, lineId?: number): string =>
    !!lineId ?
      `[录分: LRHH ${lineId} 分数]\n[集合地点: ${config.event.name ? config.event.name : '红活团未指定'}]\n[集团发车编号🔥 ${lineId} ]` :
      `[若小蛇座不在请手@队友]\n[集合默认BSO无加成顺延]\n[集团发车口令🔰  A${lineLevel}  ]`
}

function validate_tech(arg: string): number[] | null {
  if (!arg) return null
  const match = arg.match(/创(\d+)[\s\S]*?富(\d+)[\s\S]*?延(\d+)[\s\S]*?强(\d+)/)
  if (!match) return null
  const techs = [+match[1], +match[2], +match[3], +match[4]]
  return techs.every(n => n >= 1 && n <= 15) ? techs : null
}

const isBasicType = (joinType: string): boolean =>
  /^(h?[rdks]\d*|[rdks])$/i.test(joinType)

const valid_drs = (drs_num: number): boolean =>
  !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12

const validate = async (checks: { (): boolean }[]) => {
  for (const check of checks) {
    if (check()) return true
  }
  return false
}

const validate_all = async (checks: { (): boolean }[]) => {
  let result = false
  for (const check of checks) {
    if (check()) result = true
  }
  return result
}

const style_num = (num: number): string =>
  String.fromCodePoint(48 + num) + '\u20E3'

const init_msg = (session: Session): string =>
  `请先自助初始化\n初始化指令用法:CSH (自己的QQ号)\n如有错误请联系管理员帮助\n${session.userId}`

const style_tech = (techs: number[]): string =>
  techs.every(t => !t) ? '科技未录入' : `创${techs[0]}富${techs[1]}延${techs[2]}强${techs[3]}`

const head_msg = (session: Session): string =>
  session.qq ? '-\n' : ''

const format_dr_count = (lineNum: number, lineMax: number): string =>
  lineMax > 1 ? `\n———————————\n发车人数 [${lineNum}/${lineMax}]` : ''