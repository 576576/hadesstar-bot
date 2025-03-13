import { Context, Schema, Session, Tables, $, FlatPick } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'
import { } from '@koishijs/plugin-adapter-qq'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config {
  humorousRemarks?: string[]
  rsEventGroupName?: string
  drsWaitTime?: number
}

export const Config: Schema<Config> = Schema.object({
  // humorousRemarks: Schema.array(Schema.string()).description('骚话模块使用的句子').default(['大哥你去哪了，我是你的小张飞呀!', '义父你去哪了，我是你的小奉先呀!']),
  rsEventGroupName: Schema.string().description('红活榜单使用的集团名').default(''),
  drsWaitTime: Schema.number().description('每个玩家在超时前等待的时间 ms').default(18e5)
})

//初始化各种变量
var rs_event_status: boolean

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

  initPlayerTables()
  initRsEventTables()

  //权限管理
  ctx.permissions.provide('authority:2', async (name, session) => {
    return session.onebot?.sender?.role === 'owner' || session.onebot?.sender?.role === 'admin'
  })

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
        nullable: false,
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

    // //骚话模块
    // let isToSaohua = (Math.random() >= 0.995)
    // if (isToSaohua) saohuaTalk(session)

  })

  // //重置 CZHX 管理指令
  // ctx.command('CZHX', '重置所有玩家数据')
  //   .action(async ({ session }) => {
  //     if (!isAdmin(session)) {
  //       session.send('无管理权限')
  //       return
  //     }
  //     // 重置players及dlines
  //     resetATable('players')
  //     resetATable('dlines')
  //     initPlayerTables()
  //     session.send('已重置所有玩家数据')
  //   })

  ctx.command('CZ <userId>', '重置单个玩家数据')
    .action(async ({ session }, userId) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, userId)
      if (!qqid) {
        session.send('未找到该玩家')
        return
      }
      await ctx.database.remove('dlines', { qid: qqid })
      await ctx.database.remove('elines', { qid: qqid })
      await ctx.database.remove('erank', { qid: qqid })
      session.send('已重置一名玩家数据')
    })

  // //调试 ts 群主及代理首席指令
  // ctx.command('ts', '调试数据表')
  //   .action(async ({ session }) => {
  //     if (!isAdmin(session)) {
  //       session.send('无管理权限')
  //       return
  //     }
  //     console.clear()
  //     console.log('\n\n')
  //     let tsTables = ['players', 'dlines', 'elines', 'erank']
  //     for (const tsTable of tsTables) {
  //       console.log(`${tsTable}数据如下:\n——————————\n`)
  //       console.log(await ctx.database.get(tsTable as any, {}))
  //     }
  //   })

  // //测试 cs 管理指令
  // ctx.command('cs', '')
  //   .action(async ({ session }) => {
  //     if (!isAdmin(session)) {
  //       session.send('无管理权限')
  //       return
  //     }
  //     await session.sendQueued('ok')
  //     console.log(await showAllLines(session))
  //   })

  //初始化 CSH <qid> [openId]
  ctx.command('CSH <qid> ', '初始化玩家数据')
    .action(async ({ session }, qid, openId?) => {
      if (!qid || isNaN(+qid)) {
        session.send('初始化失败,请输入玩家id')
        return
      }
      if (!!openId && !isAdmin(session)) {
        session.send('无管理权限,无法初始化他人')
        return
      }
      if (!openId) openId = session.userId
      console.log(`${openId}: 绑定了${qid}`)
      await ctx.database.upsert('players', () => [{ qid: qid, openId: openId, cachedName: qid }])
      session.send(`已进行初始化\n请使用LR名字 LR集团 LR科技录入信息`)
    })

  //加入三人组队 D<7-12>
  ctx.command('D <arg>')
    .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
    .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
    .alias('D6', { args: ['6'] }).alias('K6', { args: ['6'] }).alias('HS6', { args: ['6'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(`请使用CSH (游戏号)初始化`)
        return
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `D${arg}`)
        return
      }
      if (arg == '6') {
        let isInit = await isInitialized(session)
        if (!isInit) {
          session.send(`请使用CSH (游戏号)自助初始化,或附带以下信息联系管理💦\n${session.userId}`)
          return
        }
        session.send('暗红巨星的最低等级为7哦💦')
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  //加入双人组队 K<7-12>
  ctx.command('K <arg>')
    .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
    .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(`请使用CSH (游戏号)初始化`)
        return
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `K${arg}`)
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  //加入单人红活 HS<7-12>
  ctx.command('HS <arg>')
    .alias('HS7', { args: ['7'] }).alias('HS8', { args: ['8'] }).alias('HS9', { args: ['9'] })
    .alias('HS10', { args: ['10'] }).alias('HS11', { args: ['11'] }).alias('HS12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(`请使用CSH (游戏号)自助初始化,或附带以下信息联系管理💦\n${session.userId}`)
        return
      }
      if (!rs_event_status) {
        session.send('红活未开启')
        return
      }
      if (isValidDrsNum(+arg)) {
        await join_rs_event(session, `HS${arg}`)
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  //退出组队 TC
  ctx.command('TC', '退出所有列队')
    .action(async ({ session }) => {
      await quit_drs(session)
    })

  //查询组队情况 CK[7-12]
  ctx.command('CK [arg]', '查询组队情况 例: CK CK9')
    .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
    .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      if (isValidDrsNum(+arg)) {
        await session.send(await showALine(session, +arg))
      }
      else await session.send(await showAllLines(session))
    })

  //查询个人信息 CX[userId]
  ctx.command('CX [userId]')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId, true)
      if (!qqid) return
      let isInit = await isInitialized(session, qqid)

      console.log(`${await getQQid(session)}: 试图查询${qqid}信息`)
      if (!qqid || !isInit) session.send('玩家信息未初始化\n请使用CSH 指令自助初始化')
      else session.send(await formatted_playerdata(session, qqid))
    })

  //更新信息 LR[科技/集团/名字]
  ctx.command('LR科技 <techString> [playerId]')
    .alias('LR')
    .action(async ({ session }, techString, playerId?) => {
      if (playerId != undefined && !isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (techString == undefined) {
        session.send('请录入正确科技格式\nLR科技 创1富2延3强4')
        return
      }
      let techs_in: number[] = validateTechs(techString)
      if (techs_in) {
        await ctx.database.upsert('players', () => [{ qid: qqid, techs: techs_in }])
        await session.send(`已录入${techString}`)
      }
      else {
        await session.send('请录入正确科技格式\n例: LR科技 创1富2延3强4')
      }
    })
  ctx.command('LR名字 <nick> [playerId]')
    .alias('LR账号')
    .action(async ({ session }, nick, playerId?) => {
      if (playerId != undefined && !isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (!nick) {
        session.send('请录入正确名字格式\n例: LR名字 高声豪歌')
        return
      }
      else {
        await ctx.database.upsert('players', () => [{ qid: qqid, cachedName: nick }])
        await session.send(`已录入名字 ${nick}`)
      }
    })
  ctx.command('LR集团 <playerGroup> [playerId]', 'LR集团 巨蛇座星雲')
    .alias('LR常驻集团')
    .action(async ({ session }, playerGroup, playerId?) => {
      if (playerId != undefined && !isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (!playerGroup) {
        session.send('请录入正确集团格式\n例: LR集团 第〇序列')
        return
      }
      else {
        await ctx.database.upsert('players', () => [{ qid: qqid, group: playerGroup }])
        await session.send(`已录入集团 ${playerGroup}`)
      }
    })

  //授权车牌 SQ <licence> <playerId> 管理指令
  ctx.command('SQ <licence> <playerId>', '授权车牌 SQ D9 11451')
    .action(async ({ session }, licence, playerId) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      if (!playerId) {
        session.send('请录入正确玩家id\n例: SQ D9 114514')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      let isInit = await isInitialized(session, qqid)
      if (!qqid || !isInit) return

      let licenceNum = +(licence.substring(1))
      if (!isValidDrsNum(licenceNum)) {
        await session.send('请输入正确车牌数字7-12')
        return
      }
      console.log(`${qqid}:正在获取D${licenceNum}车牌`)
      await ctx.database.upsert('players', () => [{ qid: qqid, licence: licenceNum }])
      await session.send(`已授予${await getUserName(session, qqid)} D${licenceNum}车牌`)
    })

  //启动或关闭红活 KGH 管理指令
  ctx.command('KGH [eState]', '')
    .alias('KH', { args: ['true'] }).alias('GH', { args: ['false'] })
    .action(async ({ session }, eState?) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      if (eState != undefined) rs_event_status = !eState
      if (rs_event_status) await session.send('红星活动已关闭\n输入PH查看排行\n输入CZHH重置红活')
      else {
        initRsEventTables()
        session.send('红星活动已开启\n输入HS7-12开始红活')
      }
      rs_event_status = !rs_event_status
    })

  //生成红活排行并合并转发 PH
  ctx.command('PH', '查看红活排行')
    .action(async ({ session }) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let einfos = (await ctx.database.select('erank').orderBy(row => row.totalScore, 'desc').execute())
      if (einfos[0] == undefined) {
        await session.sendQueued('未检索到红活排行信息')
        return
      }
      let dateNow = new Date()
      let tmp = [`${config.rsEventGroupName} ${dateNow.getFullYear()}.${dateNow.getMonth()}.${dateNow.getDay()}红活榜`], index = 0
      for (const einfo of einfos) {
        let index2 = Math.floor(index / 15)
        tmp[index2] += `\n${++index}. ${await formatted_RsEvent(session, einfo.qid)}`
      }
      for (var i of tmp) {
        await session.sendQueued(i)
      }
    })

  ctx.command('LRHH <lineNum> <eventRunScore>')
    .action(async ({ session }, lineNum, eventRunScore) => {
      if (!rs_event_status) {
        session.sendQueued('红活已关闭,禁止录入')
        return
      }
      let runScore = Number.parseInt(eventRunScore)
      if (isNaN(+lineNum) || isNaN(runScore)) {
        session.sendQueued('录入失败, 请检查指令\nLRHH 红活号码 红活分数')
        return
      }
      let einfo = await updateEventScore(session, +lineNum, runScore)
      if (einfo) {
        let playerName = await getUserName(session, await getQQid(session))
        session.send(`${playerName} 录入成功\n————————————\n╔ 车队序号: ${+lineNum}\n╠ 当前次数: ${einfo[0]}\n╠ 本轮分数: ${runScore}\n╚ 当前总分: ${einfo[1]}`)
      }
    })

  ctx.command('CXHH [userId]')
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
      session.send(`${((!session.onebot) ? '-\n' : '')}${await getUserName(session, qqid)} 红活状态:\n╔ 当前次数: ${einfo[0]}\n╠ 当前总分: ${einfo[1]}\n╚ 当前排行: ${eventOrder}${rs_event_status ? '' : '\n——————————\n历史数据(红活未开启)'}`)
    })

  ctx.command('LH <eScore> <userId>', '管理覆盖录入红活')
    .action(async ({ session }, userId, eScore_in) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, userId)
      if (!qqid) return

      let eScore = Number.parseInt(eScore_in)
      if (isNaN(eScore)) {
        session.sendQueued('录入失败, 请检查指令\nLH 玩家id 红活分数')
        return
      }
      let lineId = await join_rs_event(session, 'HS6')
      let einfo = await updateEventScore(session, lineId, eScore, qqid)
      if (einfo != null) {
        session.send(`-\n${await getUserName(session, qqid)} 录入红活成功\n————————————\n序号: ${lineId}\n次数: ${einfo[0]}\n总分: ${einfo[1]}`)
      }
    })

  ctx.command('CZHH', '重置红活')
    .action(({ session }) => {
      if (!isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      session.sendQueued(`红活数据已${rs_event_status ? '关闭并' : ''}重置`)
      rs_event_status = false
      resetATable('elines')
      resetATable('erank')
      initRsEventTables()
    })

  console.clear()

  async function join_drs(session: Session, joinType: string): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    console.log(`\n${qqid}: 尝试加入${joinType}队伍`)
    //检查车牌
    let lineLevel = (+joinType.substring(1))

    let pInfo = await getUserInfo(qqid)
    if (pInfo.licence < lineLevel) {
      await session.send(`你未获得${joinType}车牌,请联系管理授权`)
      return
    }
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
          await ctx.database.upsert('players', () => [{ qid: driverId, playRoutes: tmp }])
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
    let lineLevel = (+joinType.substring(2))
    let driverLicence = await getLicence(qqid)
    if (driverLicence < lineLevel) {
      await session.send(`你未获得${joinType}车牌,请联系管理授权`)
      return null
    }
    //开始红活单刷
    let foundType = await findDrsFromId(session, qqid)
    if (foundType == 'K0') {
      await ctx.database.create('elines', { qid: qqid })
      let dinfo = await ctx.database.get('elines', { qid: qqid }, ['lineId', 'runScore'])
      let lineNum = dinfo.length
      let lineId = dinfo[dinfo.length - 1].lineId + 1000
      let eventScore = 0
      let playerGroup = await getGroup(qqid)
      if (dinfo) eventScore = +(await getEventInfo(qqid))[1]
      var drs_message = `${session.onebot ? session.author.nick : ''} 加入${joinType}队伍\n————————————\n╔ [${playerGroup}]\n╠ 红活次数: ${lineNum}\n╠ 红活总分: ${eventScore}\n╚ 车队编号: ${lineId}\n————————————\nLRHH ${lineId} 得分`
      await session.send(drs_message)
      return dinfo[dinfo.length - 1].lineId
    }
    else {
      await quit_drs(session)
      await join_rs_event(session, joinType)
    }
  }

  async function updateEventScore(session: Session, lineId_in: number, score: number, playerId?: string): Promise<any[]> {
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
    let scoreBefore = einfo[0].runScore
    await ctx.database.upsert('elines', (row) => [{ qid: qqid, lineId: lineId, runScore: $.add(row.runScore, score) }])
    let runAfter = (await ctx.database.get('erank', { qid: qqid }))[0].totalRuns
    return [runAfter, scoreBefore + score]
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
    let playerName = await getUserName(session, playerId)
    let pInfo = await getUserInfo(playerId)
    let einfo = await getEventInfo(playerId)
    return isDetail ? `╔ 名称: ${playerName}\n╠ [${pInfo.group}]╠ 场次: ${einfo[0]}\n╚ 总分: ${einfo[1]}` :
      `${await getUserName(session, playerId)}\n【总分:${einfo[1]} 场次:${einfo[0]}】`
  }

  async function showAllLines(session: Session): Promise<string> {
    let linesMsg = ((!session.onebot) ? '-\n' : ''), lineMsg: string, dinfo: string[]
    for (var i = 7; i <= 12; i++) {
      lineMsg = ''
      dinfo = await findIdFromDrs(`D${i}`)
      if (dinfo.length != 0) lineMsg += `D${i}队列—————\n${(await formatted_DrsN(session, `D${i}`))}${await drs_timer(session, `D${i}`)}\n`
      dinfo = await findIdFromDrs(`K${i}`)
      if (dinfo.length != 0) lineMsg += `K${i}队列—————\n${(await formatted_DrsN(session, `K${i}`))}${await drs_timer(session, `K${i}`)}\n`
      linesMsg += lineMsg
    }
    if (linesMsg == ((!session.onebot) ? '-\n' : '')) return '所有队列为空'
    else linesMsg += '————————\n其余队列为空'
    return linesMsg
  }

  async function showALine(session: Session, lineNum: number): Promise<string> {
    let lineMsg = ((!session.onebot) ? '-\n' : ''), dinfo: string[]
    dinfo = await findIdFromDrs(`D${lineNum}`)
    if (dinfo.length != 0) lineMsg += `D${lineNum}队列—————\n${(await formatted_DrsN(session, `D${lineNum}`))}${await drs_timer(session, `D${lineNum}`)}\n`
    dinfo = await findIdFromDrs(`K${lineNum}`)
    if (dinfo.length != 0) lineMsg += `K${lineNum}队列—————\n${(await formatted_DrsN(session, `K${lineNum}`))}${await drs_timer(session, `K${lineNum}`)}\n`
    if (!lineMsg.includes('队列')) lineMsg += `D${lineNum}/K${lineNum}队列为空`
    return lineMsg
  }

  async function getUserInfo(playerId: string): Promise<Pick<Players, 'licence' | 'playRoutes' | 'techs' | 'group' | 'cachedName'>> {
    return (await ctx.database.get('players', { qid: playerId }, ['licence', 'playRoutes', 'techs', 'group', 'cachedName']))[0]
  }

  async function getLicence(playerId: string): Promise<number> {
    return (await ctx.database.get('players', { qid: playerId }, ['licence']))[0].licence
  }

  async function getGroup(playerId: string): Promise<string> {
    return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
  }

  async function getEventInfo(playerId: string) {
    let einfo = (await ctx.database.get('erank', { qid: playerId }))[0]
    if (einfo == undefined) return [0, 0]
    return [einfo.totalRuns, einfo.totalScore]
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
    if (!isInit) return '玩家信息未初始化\n请使用CSH 指令自助初始化'
    let pInfo = await getUserInfo(playerId)
    let playerTech = formatted_Tech(pInfo.techs)
    return `${((!session.onebot) ? '-\n' : '')}玩家: ${pInfo.cachedName}\n集团: ${pInfo.group}\n车牌: D${pInfo.licence}\n场数: ${pInfo.playRoutes}\n科技: ${playerTech}`
  }

  async function drs_timer(session: Session, targetType: string): Promise<string> {
    let timerList = await findWaitFromDrs(session, targetType)
    console.log(timerList)
    let tmp = '超时计时: '
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
      if (session.onebot) return session.userId
      else {
        qqid = await findQQidFromOpenId(session.userId)
        if (!qqid && noisy) session.send(`请联系管理初始化💦\n${session.userId}`)
        return qqid
      }
    }
    if (session.onebot) {
      let match = userId.match(/<at\s+[^>]*id="(\d+)"/)
      if (match && match[1] != undefined) return match[1]
      else if (!isNaN(+userId)) return userId
    }
    if (!isNaN(+userId)) qqid = await findQQidFromOpenId(await findOpenIdFromQQid(userId))
    else qqid = await findQQidFromOpenId(userId)
    if (!qqid && noisy) session.send('玩家信息未初始化\n请使用CSH 指令自助初始化')
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

  function isAdmin(session: Session): boolean {
    // return config.adminList.includes(session.userId)
    return true //腾讯权限系统不完善，暂时关闭
  }

  function validateTechs(arg: string): number[] {
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

  async function saohuaTalk(session: Session) {
    let saohua = config.humorousRemarks
    await session.sendQueued(saohua[Math.floor(Math.random() * saohua.length)])
  }
}

function isValidDrsNum(drs_num: number): boolean {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

function isValidTechNum(techNum: number): boolean {
  return !isNaN(techNum) && techNum >= 1 && techNum <= 15
}