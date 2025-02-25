import { at } from '@satorijs/element/jsx-runtime'
import { Context, h, Schema, Session, sleep, Tables } from 'koishi'
import { CQCode } from 'koishi-plugin-adapter-onebot'


export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//初始化各种变量
var defaultQQid = 0, defaultName = '巨蛇座星雲', defaultWaitDueTime = 20 * 6e4
var rs_event_status = false, isToSaohua = false

declare module 'koishi' {
  interface Tables {
    players: Players
    dlines: DrsLines
    elines: RsEventLines
  }
}

// 这里是新增表的接口类型
export interface Players {
  qid: number
  licence: number
  playRoutes: Array<number>
  techs: Array<number>
  group: string
}
export interface DrsLines {
  qid: number
  lineType: string
  waitDue: number
}
export interface RsEventLines {
  qid: number
  runScore: number
  lineId: number
}

export function apply(ctx: Context) {

  // 初始化表players
  ctx.model.extend('players', {
    qid: {
      type: 'integer',
      length: 18,
      initial: 0,
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
      type: 'integer',
      length: 18,
      initial: 0,
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
      initial: Date.now() + defaultWaitDueTime,
      nullable: false,
    },
  }, {
    primary: 'qid',
    autoInc: false,
  })

  // 初始化表elines
  ctx.model.extend('elines', {
    qid: {
      type: 'integer',
      length: 18,
      initial: 0,
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
      initial: 1000,
      nullable: false,
    },
  }, {
    primary: 'lineId',
    autoInc: true,
  })

  //重置 cz 管理指令
  ctx.command('cz', '重置数据表', { authority: 2 })
    .action(async (_) => {
      // 重置players及dlines
      ctx.database.drop('players')
      ctx.model.extend('players', {
        qid: {
          type: 'integer',
          length: 18,
          initial: 0,
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
      ctx.database.drop('dlines')
      ctx.model.extend('dlines', {
        qid: {
          type: 'integer',
          length: 18,
          initial: 0,
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
          initial: Date.now() + defaultWaitDueTime,
          nullable: false,
        },
      }, {
        primary: 'qid',
        autoInc: false,
      })
      ctx.database.drop('elines')
      ctx.model.extend('elines', {
        qid: {
          type: 'integer',
          length: 18,
          initial: 0,
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
          initial: 1000,
          nullable: false,
        },
      }, {
        primary: 'lineId',
        autoInc: true,
      })
    })

  ctx.command('cz999999999', 'drop所有表', { authority: 2 })
    .action((_) => {
      ctx.database.dropAll()
    })

  //调试 ts 群主及代理首席指令
  ctx.command('ts', '调试数据表', { authority: 2 })
    .action(async ({session}) => {
      console.clear()
      console.log('\n\n')
      let tsTables = ['players', 'dlines', 'elines']
      for (const tsTable of tsTables) {
        console.log(`${tsTable}数据如下:\n——————————`)
        console.log(await ctx.database.get('players', { qid: { $gt: 0 } }))
      }
    })

    //测试 cs 管理指令
    ctx.command('cs', '', { authority: 2 })
      .action(async ({session}) => {
        await sleep(Math.random() * 1000)
        await session.onebot.sendGroupMsg(session.guildId, 'ok')
        console.log(await showAllLines(ctx, session))
      })

    //加入三人组队 D<7-12>
    ctx.command('D <arg>')
      .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
      .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
      .action(async ({session}, arg) => {
        if (isValidDrsNum(+arg)) {
          console.log(session.author)
          await sleep(Math.random() * 1000)
          await join_drs(ctx, session, `D${+arg}`)
        }
      })

    //加入双人组队 K<7-12>
    ctx.command('K <arg>')
      .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
      .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
      .action(async ({session}, arg) => {
        if (isValidDrsNum(+arg)) {
          await sleep(Math.random() * 1000)
          await join_drs(ctx, session, `K${+arg}`)
        }
      })

    //加入单人红活 HS<7-12>
    ctx.command('HS <arg>')
      .alias('HS7', { args: ['7'] }).alias('HS8', { args: ['8'] }).alias('HS9', { args: ['9'] })
      .alias('HS10', { args: ['10'] }).alias('HS11', { args: ['11'] }).alias('HS12', { args: ['12'] })
      .action(async ({session}, arg) => {
        await sleep(Math.random() * 1000)
        if (!rs_event_status) {
          session.onebot.sendGroupMsg(session.guildId, '红活未开启')
        }
        if (isValidDrsNum(+arg)) {
          await join_rs_event(ctx, session, `HS${arg}`)
        }
      })

    //退出组队 TC
    ctx.command('TC', '退出所有列队')
      .action(async ({session}) => {
        await quit_drs(ctx, session)
      })

    //查询组队情况 CK[7-12]
    ctx.command('CK [arg]', '查询组队情况 例: CK CK9')
      .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
      .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
      .action(async ({session}, arg) => {
        await sleep(Math.random() * 1000)
        if (isValidDrsNum(+arg)) {
          await session.onebot.sendGroupMsg(session.guildId, await showALine(ctx, session, +arg))
        }
        else await session.onebot.sendGroupMsg(session.guildId, await showAllLines(ctx, session))
      })

    //查询个人信息 CX[getQQid(session)]
    ctx.command('CX [arg]')
      .action(async ({session}, arg) => {
        let tmp: number
        if (arg == undefined) tmp = getQQid(session)
        else tmp = await validateQQid(arg)

        console.log(`${getQQid(session)}: 试图查询${tmp}信息`)
        if (tmp != null) {
          await sleep(Math.random() * 1000)
          await session.onebot.sendGroupMsg(session.guildId, await formatted_playerdata(ctx, session, tmp))
        }
      })

    //更新信息 LR[科技/集团]
    ctx.command('LR <arg>', 'LR 创0富0延0强0')
      .action(async ({session}, arg) => {
        if (arg == undefined) return
        let techs_in: number[] = await validateTechs(arg)
        if (techs_in != null) {
          await ctx.database.upsert('players', () => [{ qid: getQQid(session), techs: techs_in }])
          await session.onebot.sendGroupMsg(session.guildId, `已录入${await getTech(ctx, getQQid(session))}`)
        }
        else {
          await session.sendQueued('请录入正确科技格式')
        }
      })
    ctx.command('LR常驻集团 <arg> <arg2>', 'LR常驻集团 <getQQid(session)/at> 巨蛇座星雲')
      .action(async ({session}, arg, arg2) => {
        let tmp: number = await validateQQid(arg)
        if (tmp == null) return
        if (arg2 == undefined) return
        else {
          let playerGroup = arg2.trim()
          console.log(`${tmp}:: ${playerGroup}`)
          if (playerGroup != '') {
            await ctx.database.upsert('players', () => [{ qid: tmp, group: playerGroup }])
            await session.onebot.sendGroupMsg(session.guildId, `已录入常驻集团 ${await getGroup(ctx, tmp)}`)
          }
        }
      })

    //授权车牌 SQ <getQQid(session)/at> <licence> 管理指令
    ctx.command('SQ <arg> <arg2>', '授权车牌 SQ 114514 D9', { authority: 2 })
      .action(async ({session}, arg, arg2) => {
        //此处应该授权车牌
        let tmp: number = await validateQQid(arg)
        if (tmp == null) return
        let tmp2: number = +(arg2.substring(1).trim())
        if (!isValidDrsNum(tmp2)) {
          await session.onebot.sendGroupMsg(session.guildId, '请输入正确车牌数字<7-12>')
          return
        }
        console.log(tmp)
        console.log(tmp2)
        await ctx.database.upsert('players', () => [{ qid: tmp, licence: tmp2 }])
        await session.onebot.sendGroupMsg(session.guildId, `已授予${atViaId(tmp)} D${tmp2}车牌`)
      })

    //启动红活 KH 管理指令
    ctx.command('KH', '', { authority: 2 })
      .action(async ({session}) => {
        await session.onebot.sendGroupMsg(session.guildId, '红星活动已开启\n输入HS7-12开始红活')
        rs_event_status = true
      })

    ctx.command('GH', '', { authority: 2 })
      .action(async ({session}) => {
        await session.onebot.sendGroupMsg(session.guildId, '红星活动已关闭\n输入PH查看排行')
        rs_event_status = false
      })

    ctx.command('LRHH <arg> <arg2>')
      .action(async ({session}) => {

      })

  //权限管理
  ctx.permissions.provide('authority:2', async (name, session) => {
    return session.onebot?.sender?.role === 'owner'
  })
  ctx.permissions.provide('authority:2', async (name, session) => {
    return session.onebot?.sender?.role === 'admin'
  })

  console.clear()

  //主监听用户输入
  ctx.on('message', async (session) => {

    //初始化会话监听
    ctx.database.upsert('players', () => [{ qid: getQQid(session) }])

    if (session.content.startsWith('SQ<at qq')) {
      let tmp = session.content.match(/^SQ<at\s+[^>]*id="(\d+)"[^>]*>/)
      let tmp2 = session.content.match(/D\d+/)
      if (tmp != null && tmp2 != null && isValidDrsNum(+tmp2[1]))
        session.execute(`SQ ${tmp} ${tmp2}`)
    }

    console.log(`\n${getQQid(session)}: ${session.content}`)

    //骚话模块
    isToSaohua = (Math.random() >= 0.95)
    if (isToSaohua) saohuaTalk(session)

    
  })
}

async function join_drs(ctx: Context, session: Session, joinType: string): Promise<void> {
  let qqid = session.onebot.user_id
  console.log(`\n${session.onebot.user_id}: 尝试加入${joinType}队伍`)
  //检查车牌
  let lineLevel = (+joinType.substring(1))
  let driverLicence = await getLicence(ctx, qqid)
  console.log(`drivelicence:${driverLicence} dlevel:${lineLevel}`)
  if (driverLicence < lineLevel) {
    await session.onebot.sendGroupMsg(session.guildId, `你未获得${joinType}车牌`)
    return
  }
  let foundType = await findDrsFromId(ctx, session, qqid)
  if (foundType == 'K0') {
    await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType }])
    let dinfo = await findIdFromDrs(ctx, joinType)
    let lineNum = dinfo.length
    let lineMaximum = joinType.indexOf('K') != -1 ? 2 : 3
    var drs_message = `${await getNameFromQid(ctx, session, qqid)} 成功加入${joinType}队伍\n——————————————\n发车人数 [${lineNum}/${lineMaximum}]\n——————————————\n${await formatted_DrsN(ctx, session, joinType)}——————————————\n`

    //发车
    if (lineNum >= lineMaximum) {
      drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${joinType.substring(1)}  ]`
      //发车后清空队伍
      for (const driverId of dinfo) {
        let tmp = (await ctx.database.get('players', { qid: driverId }))[0].playRoutes
        tmp[lineLevel - 7] += 1
        await ctx.database.upsert('players', () => [{ qid: qqid, playRoutes: tmp }])
      }
      await ctx.database.remove('dlines', { lineType: joinType })
    }
    else drs_message += await drs_timer(ctx, joinType)
    await session.onebot.sendGroupMsg(session.guildId, drs_message)
    return
  }
  else if (foundType == joinType)
    await session.onebot.sendGroupMsg(session.guildId, `你已在${joinType}队伍中`)
  else {
    await quit_drs(ctx, session)
    await join_drs(ctx, session, joinType)
  }
}

async function quit_drs(ctx: Context, session: Session): Promise<void> {
  let foundType = await findDrsFromId(ctx, session, getQQid(session))
  if (foundType != 'K0') {
    await ctx.database.remove('dlines', { qid: getQQid(session) })
    await session.onebot.sendGroupMsg(session.guildId, `${await getNameFromQid(ctx, session, getQQid(session))} 已退出${foundType}队列`)
  }
  else await session.onebot.sendGroupMsg(session.guildId, "你未在队伍中")
}

async function join_rs_event(ctx: Context, session: Session, joinType: string): Promise<void> {
  console.log(`\n${getQQid(session)}: 尝试加入${joinType}队伍`)
  //检查车牌
  let lineLevel = (+joinType.substring(1))
  let driverLicence = await getLicence(ctx, getQQid(session))
  if (driverLicence < lineLevel) {
    await session.onebot.sendGroupMsg(session.guildId, `你未获得${joinType}车牌`)
    return
  }
  //开始红活单刷
  let foundType = await findDrsFromId(ctx, session, getQQid(session))
  if (foundType == 'K0') {
    await ctx.database.create('elines', { qid: getQQid(session) })
    let dinfo = await ctx.database.get('elines', { qid: getQQid(session) }, ['lineId', 'runScore'])
    let lineNum = dinfo.length
    let eventScore = 0
    var drs_message = `${session.author.nick} 成功加入${joinType}队伍\n——————————————\n红活运行次数: ${lineNum}\n红活总分: ${eventScore}\n——————————————\nLRHH ${dinfo[dinfo.length - 1].lineId} 本回得分`
    await session.onebot.sendGroupMsg(session.guildId, drs_message)
    return
  }
  else {
    await quit_drs(ctx, session)
    await join_rs_event(ctx, session, joinType)
  }
}

async function findIdFromDrs(ctx: Context, checkType: string): Promise<number[]> {
  let dinfo = await ctx.database.get('dlines', { lineType: checkType })
  if (dinfo[0] == undefined) return []
  let foundIdList = []
  dinfo.forEach(element => {
    foundIdList.push(element.qid)
  });
  return foundIdList
}

async function findWaitFromDrs(ctx: Context, checkType: string): Promise<string[]> {
  let dinfo = await ctx.database.get('dlines', { lineType: checkType })
  if (dinfo[0] == undefined) return []
  let foundIdList: string[] = []
  dinfo.forEach(element => {
    let waitTimeLeft = element.waitDue - Date.now()
    let formatted_time = `${Math.floor(waitTimeLeft / 6e4)}:${('' + Math.floor((waitTimeLeft % 6e4) / 1e3)).padStart(2, '0')}`
    foundIdList.push(formatted_time)
  });
  return foundIdList
}

async function findDrsFromId(ctx: Context, session: Session, playerId: number): Promise<string> {
  let dinfo = await ctx.database.get('dlines', { qid: playerId })
  if (dinfo[0] == undefined) return 'K0'
  else if (Date.now() >= dinfo[0].waitDue) {
    await ctx.database.remove('dlines', { qid: playerId })
    await session.onebot.sendGroupMsg(session.guildId, `${atViaId(playerId)} 超时被踢出${dinfo[0].lineType}队列`)
    return 'K0'
  }
  else return dinfo[0].lineType
}



async function formatted_DrsN(ctx: Context, session: Session, targetType: string): Promise<string> {
  let targetNum = +targetType.substring(1)
  let dinfo = await findIdFromDrs(ctx, targetType)
  if (dinfo.length == 0) return `${targetType}队列为空`
  let tmp = []
  let drs_message = ''
  for (const playerId of dinfo) {
    let playerName = await getNameFromQid(ctx, session, playerId)
    let playerRoute = await getPlayRoutes(ctx, playerId)
    let playerTech = await getTech(ctx, playerId)
    drs_message += `╔${atViaId(playerId)} ${playerRoute[targetNum - 7]}\n╚［${playerTech}]\n`
  }
  return drs_message
}

async function showAllLines(ctx: Context, session: Session): Promise<string> {
  let linesMsg = '', lineMsg: string, tmp: string
  for (var i = 7; i <= 12; i++) {
    lineMsg = ''
    tmp = await formatted_DrsN(ctx, session, `D${i}`)
    if (tmp.indexOf('队列为空') == -1) lineMsg += `D${i}队列—————\n${tmp}`
    tmp = await formatted_DrsN(ctx, session, `K${i}`)
    if (tmp.indexOf('队列为空') == -1) lineMsg += `K${i}队列—————\n${tmp}`
    linesMsg += lineMsg
  }
  if (linesMsg == '') return '所有队列为空'
  else linesMsg += '\n其余队列为空'
  return linesMsg
}

async function showALine(ctx: Context, session: Session, lineNum: number): Promise<string> {
  return `D${lineNum}队列—————\n${await formatted_DrsN(ctx, session, `D${lineNum}`)}K${lineNum}队列—————\n${await formatted_DrsN(ctx, session, `K${lineNum}`)}`
}

async function getLicence(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['licence']))[0].licence
}

async function getPlayRoutes(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['playRoutes']))[0].playRoutes
}

async function getTech(ctx: Context, playerId: number) {
  let techs_get = (await ctx.database.get('players', { qid: playerId }, ['techs']))[0].techs
  return `创${techs_get[0]}富${techs_get[1]}延${techs_get[2]}强${techs_get[3]}`
}

async function getGroup(ctx: Context, playerId: number): Promise<string> {
  return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
}

async function getNameFromQid(ctx: Context, session: Session, playerId: number): Promise<string> {
  if (!session.onebot) {
    // For test cases
    switch (playerId) {
      case 1: return 'Alice'
      case 2: return 'Bob'
      case 3: return 'Carol'
    }
    return defaultName
  }
  return (await session.onebot.getGroupMemberInfo(session.guildId, playerId)).nickname
}

async function formatted_playerdata(ctx: Context, session: Session, playerId: number): Promise<string> {
  return `${atViaId(playerId)}\nQQ: ${playerId}\n车牌: D${await getLicence(ctx, playerId)}\n场数: ${await getPlayRoutes(ctx, playerId)}\n科技: ${await getTech(ctx, playerId)}\n集团: ${await getGroup(ctx, playerId)}`
}

async function drs_timer(ctx: Context, targetType: string): Promise<string> {
  let timerList = await findWaitFromDrs(ctx, targetType)
  let tmp = '超时计时: '
  for (const timer of timerList) {
    tmp += `${timer} | `
  }
  return tmp
}

async function resetATable(ctx: Context, tableName: any) {
  try {
    ctx.database.drop(tableName)
  }
  finally { }
}

function getQQid(session: Session): number {
  return +session.userId
}

async function validateQQid(arg: string): Promise<number> {
  let tmp = await arg.match(/<at\s+[^>]*id="(\d+)"/), tmp2: number = null
  if (tmp && tmp[1] != undefined) tmp2 = +tmp[1]
  else if (!isNaN(+arg)) tmp2 = +arg
  return tmp2
}

async function validateTechs(arg: string): Promise<number[]> {
  var result: number[] = []
  for (const keyword of ['创', '富', '延', '强']) {
    const match = await arg.match(`${keyword}(\\d+)`)
    if (match && match[1] != undefined && isValidTechNum(+match[1])) {
      result.push(+match[1]);
    } else {
      return null;
    }
  }
  return result;
}

function isValidDrsNum(drs_num: number): boolean {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

function isValidTechNum(techNum: number): boolean {
  return !isNaN(techNum) && techNum >= 1 && techNum <= 15
}

async function saohuaTalk(session: Session) {
  let saohua = ['大哥你去哪了，我是你的小张飞呀!', '义父你去哪了，我是你的小奉先呀!', '你会.. 陪我打暗蓝么', '悄悄告诉你一个秘密,我会打D12']
  await sleep(Math.random() * 1000)
  await session.sendQueued(saohua[Math.floor(Math.random() * saohua.length)])
}

function atViaId(playerId) {
  return `[CQ:at,qq=${playerId}]`
}
