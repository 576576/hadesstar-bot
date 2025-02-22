import { Context, Schema, Session } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//初始化各种变量
var drs_lines = [[], [], [], [], [], [], [], [], [], [], [], [], []]
var defaultQQid = 11451419, defaultName = '巨蛇座星雲', defaultWaitDueTime = 20 * 6e4
var drs_number = 0, qqid = defaultQQid

declare module 'koishi' {
  interface Tables {
    players: Players
    dlines: DrsLines
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
      nullable: true,
    },
    playRoutes: {
      type: 'array',
      initial: [0, 0, 0, 0, 0, 0],
      nullable: true,
    },
    techs: {
      type: 'array',
      initial: [0, 0, 0, 0],
      nullable: true,
    },
    group: {
      type: 'string',
      initial: '无集团',
      nullable: true,
    },
  }, {
    primary: 'qid',
    autoInc: false,
  })

  // 初始化表dlines
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

  console.clear()

  //主监听用户输入
  ctx.on('message', async (session) => {

    //初始化会话监听
    qqid = getQQid(session)
    ctx.database.upsert('players', () => [{ qid: qqid }])

    //测试 cs
    ctx.command('cs')
      .action(async (_) => {
        session.send('ok')
      })

    //加入三人组队 D<7-12>
    ctx.command('D <arg>')
      .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
      .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isValidDrsNum(drs_number)) {
          await join_drs(ctx, session, `D${drs_number}`)
        }
      })

    //加入双人组队 K<7-12>
    ctx.command('K <arg>')
      .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
      .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isValidDrsNum(drs_number)) {
          await join_drs(ctx, session, `K${drs_number}`)
        }
      })

    //退出组队 TC
    ctx.command('TC')
      .action(async (_) => { await quit_drs(ctx, session) })

    //查询组队情况 CK[7-12]
    ctx.command('CK [arg]')
      .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
      .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isNaN(drs_number)) {
          session.send(await showAllLines(ctx))
        }
        else if (isValidDrsNum(drs_number)) {
          session.send(await formatted_DrsN(ctx, `D${drs_number}`))
          session.send(await formatted_DrsN(ctx, `K${drs_number}`))
        }
      })

    //查询个人信息 CX[qqid]
    ctx.command('CX [arg]')
      .action(async (_, arg) => {
        await session.send(await formatted_playerdata(ctx, session))
      })

    //更新信息 LR[科技/集团] 会弹报错，但功能正常，不管先
    ctx.command('LR <arg:text>')
      .option('pGroup', '', { fallback: false })
      .alias('LR常驻集团', { options: { pGroup: true } })
      .action(async ({ options }, arg) => {
        console.log(`录入了 ${options.pGroup} ${arg}`)
        if (arg == undefined) return
        else if (options.pGroup) {
          let player_group = arg.trim()
          if (player_group != '') {
            await ctx.database.upsert('players', () => [{ qid: qqid, group: player_group }])
            await session.send(`已录入常驻集团 ${await getGroup(ctx, qqid)}`)
          }
        }
        else if (arg.at(0) == '创' && arg.indexOf('富') != -1) {
          let genesis = +arg.substring(1, arg.indexOf('富')),
            enrich = +arg.substring(arg.indexOf('富') + 1, arg.indexOf('延')),
            rse = +arg.substring(arg.indexOf('延') + 1, arg.indexOf('强')),
            boost = +arg.substring(arg.indexOf('强') + 1)
          let techs_in = [genesis, enrich, rse, boost]
          if (!existNaN(genesis, enrich, rse, boost)) {
            await ctx.database.upsert('players', () => [{ qid: qqid, techs: techs_in }])
            await session.send(`已录入${await getTech(ctx, qqid)}`)
          }
        }
      })

    //授权车牌 SQ
    ctx.command('SQ')
      .action(async (_, arg) => {
        //此处应该授权车牌
        await session.send(await formatted_playerdata(ctx, session))
      })
  })
}

async function join_drs(ctx: Context, session: Session, joinType: string) {
  let foundType = await findDrsFromId(ctx, session, qqid)
  if (foundType == 'K0') {
    await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType }])
    var drs_message = `${session.author.name} 成功加入${joinType}队伍\n——————————————\n发车人数 [${drs_lines[drs_number].length}/3]\n——————————————\n
    ${await formatted_DrsN(ctx, joinType)}\n——————————————\n`
    if (drs_lines[drs_number].length >= 3) {
      drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${drs_number}  ]`
      //发车后清空队伍
      drs_lines[drs_number].length = 0
    }
    else drs_message += drs_timer(drs_number)
    session.send(drs_message)
    return
  }
  else if (foundType == joinType)
    session.send(`你已在${joinType}队伍中`)
  else {
    let drs_num = drs_number
    await quit_drs(ctx, session)
    drs_number = drs_num
    await join_drs(ctx, session, joinType)
  }
}

async function findIdFromDrs(ctx: Context, checkType: string) {
  let dinfo = await ctx.database.get('dlines', { lineType: checkType })
  if (dinfo[0] == undefined) return []
  console.log(dinfo[0])
  let foundIdList = []
  dinfo.forEach(element => {
    foundIdList.push(element.qid)
  });
  return foundIdList
}

async function quit_drs(ctx: Context, session: Session) {
  let foundType = await findDrsFromId(ctx, session, qqid)
  if (foundType != 'K0') {
    await ctx.database.remove('dlines', { qid: qqid })
    session.send(`${session.author.name} 已退出D${drs_number}列队`)
  }
  else session.send("你未在队伍中")
}

async function findDrsFromId(ctx: Context, session: Session, playerId: number) {
  let dinfo = await ctx.database.get('dlines', { qid: playerId })
  if (dinfo[0] == undefined) return 'K0'
  else if (Date.now() >= dinfo[0].waitDue) {
    await ctx.database.remove('dlines', { qid: playerId })
    session.send(`@`)
    return 'K0'
  }
  else return dinfo[0].lineType
}

function isValidDrsNum(drs_num: number) {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

async function formatted_DrsN(ctx: Context, targetType: string) {
  let dinfo = await findIdFromDrs(ctx, targetType)
  if (dinfo.length == 0) return `${targetType}队列为空`
  let drs_message = ''
  drs_lines[targetType].forEach(async (playerId: number) => {
    drs_message += `╔@${playerId}  ${await getPlayRoutes(ctx, playerId)}\n╚［${await getTech(ctx, qqid)}]\n`
  })
  console.log(drs_message)
  return drs_message
}

async function showAllLines(ctx: Context) {
  let linesMsg = '', tmp: string
  for (var i = 7; i <= 12; i++) {
    tmp = await formatted_DrsN(ctx, `D${i}`)
    if (!tmp.indexOf('队列为空'))
      linesMsg += tmp
    tmp = await formatted_DrsN(ctx, `K${i}`)
    if (!tmp.indexOf('队列为空'))
      linesMsg += tmp
  }
  return linesMsg
}

async function showALines(ctx: Context, lineNum: number) {
  return `${await formatted_DrsN(ctx, `D${lineNum}`)}\n——————————————\n${await formatted_DrsN(ctx, `K${lineNum}`)}`
}

async function getPlayRoutes(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['playRoutes']))[0].playRoutes
}

async function getTech(ctx: Context, playerId: number) {
  let techs_get = (await ctx.database.get('players', { qid: playerId }, ['techs']))[0].techs
  return `创${techs_get[0]}富${techs_get[1]}延${techs_get[2]}强${techs_get[3]}`
}

async function getGroup(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
}

async function getNameFromQid(ctx: Context, session: Session, playerId: number) {
  if (!session.onebot) {
    // For test cases
    switch (playerId) {
      case 1: return 'Alice'
      case 2: return 'Bob'
      case 3: return 'Carol'
    }
    return defaultName
  }
  return session.onebot.getGroupMemberInfo(session.channelId, playerId)
}

async function formatted_playerdata(ctx: Context, session: Session) {
  return `@${session.author.name}\nQQ号: ${qqid}\n科技: ${await getTech(ctx, qqid)}\n集团: ${await getGroup(ctx, qqid)}`
}

function drs_timer(drs_num: number) {
  return `这是一个显示踢出计时器的占位符`
}

function getQQid(session: Session) {
  if (!session.onebot) {
    // For test cases
    switch (session.author.name) {
      case 'Alice': return 1
      case 'Bob': return 2
      case 'Carol': return 3
    }
    return defaultQQid
  }
  return +session.author.id
}

function existNaN(...nums: number[]) {
  nums.forEach(num => {
    if (isNaN(num)) return true
  });
  return false
}
