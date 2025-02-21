import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot'
import * as fs from 'fs/promises'
import * as path from 'path'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//初始化各种变量
var drs_lines = [[], [], [], [], [], [], [], [], [], [], [], [], []]
var drs_number = 0, defaultQQid = 11451419, qqid = defaultQQid

declare module 'koishi' {
  interface Tables {
    players: Players
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

export function apply(ctx: Context) {

  // 初始化数据库
  // const root = path.join(ctx.baseDir, 'data', 'hadesstar-bot')
  // fs.mkdir(root, { recursive: true })

  // 数据库各字段的类型声明
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
        console.log((await ctx.database.get('players', qqid))[0])
      })

    //加入三人组队 D[7-9]
    ctx.command('D <arg>')
      .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
      .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        await join_drs(ctx, session)
      })

    //退出组队 TC
    ctx.command('TC')
      .action((_) => { quit_drs(session) })

    //查询组队情况 CK[7-9 optional]
    if (session.content.substring(0, 2) === 'CK') {
      if (session.content === 'CK') {
        for (var i = 7; i <= 12; i++) {
          session.send(await formatted_DrsN(ctx, drs_number))
        }
      }
      else {
        drs_number = +session.content.substring(2)
        if (isValidDrsNum(drs_number)) {
          session.send(await formatted_DrsN(ctx, drs_number))
        }
      }
    }

    //查询个人信息 CX
    if (session.content.substring(0, 2) === 'CX') {
      if (session.content === 'CX')
        await session.send(await formatted_playerdata(ctx, session))
      else {
        //实现查别人的信息，还没想好
      }
    }

    //更新信息 LR[科技/集团]
    if (session.content.substring(0, 2) === 'LR') {
      if (session.content.at(2) == '创') {
        let genesis = +session.content.substring(3, session.content.indexOf('富')),
          enrich = +session.content.substring(session.content.indexOf('富') + 1, session.content.indexOf('延')),
          rse = +session.content.substring(session.content.indexOf('延') + 1, session.content.indexOf('强')),
          boost = +session.content.substring(session.content.indexOf('强') + 1)
        let techs = [genesis, enrich, rse, boost]
        if (!existNaN(genesis, enrich, rse, boost)) {
          ctx.database.upsert('players', () => [
            { qid: qqid, techs: techs },
          ], 'qid')
          await session.send(`已录入${await getTech(ctx,qqid)}`)
        }
      }
      else if (session.content.substring(2, 7) == '常驻集团 ') {
        let player_group = session.content.substring(7)
        if (player_group != '') {
          ctx.database.upsert('players', () => [
            { qid: qqid, group: player_group },
          ], 'qid')
          session.send(`已录入常驻集团 ${player_group}`)
        }
      }
    }

    //授权车牌 SQ
    if (session.content.substring(0, 2) === 'SQ') {
      //此处应该授权车牌
    }
  })
}

async function join_drs(ctx, session) {
  let drs_num = find_drs()
  if (drs_num == 0) {
    drs_lines[drs_number].push(qqid)
    var drs_message = `${session.author.name} 成功加入D${drs_number}队伍\n——————————————\n发车人数 [${drs_lines[drs_number].length}/3]\n——————————————\n${await formatted_DrsN(ctx, drs_number)}\n——————————————\n`
    if (drs_lines[drs_number].length >= 3) {
      drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${drs_number}  ]`
      //发车后清空队伍
      drs_lines[drs_number].length = 0
    }
    else drs_message += drs_timer(drs_number)
    session.send(drs_message)
    return
  }
  else if (drs_num == drs_number)
    session.send(`你已在D${drs_number}队伍中`)
  else {
    let drs_num = drs_number
    quit_drs(session)
    drs_number = drs_num
    join_drs(ctx, session)
  }
}

function quit_drs(session) {
  drs_number = find_drs()
  if (drs_number != 0) {
    drs_lines[drs_number].splice(drs_lines[drs_number].indexOf(qqid))
    session.send(`${session.author.name} 已退出D${drs_number}列队`)
  }
  else session.send("你未在队伍中")
}

function find_drs() {
  let drs_num = 0
  drs_lines.forEach(drs_level => {
    if (drs_level.includes(qqid)) {
      drs_num = drs_lines.indexOf(drs_level)
    }
  });
  return drs_num
}

function isValidDrsNum(drs_num) {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

async function formatted_DrsN(ctx, drs_num) {
  if (drs_lines[drs_num].length == 0) return `D${drs_num}队列为空`
  let drs_message = ``
  drs_lines[drs_num].forEach(async playerId => {
    drs_message +=
      `╔@${playerId}  ${await getPlayRoutes(ctx, playerId)}\n╚［${await getTech(ctx,qqid)}］\n`
  });
  return drs_message
}

async function getPlayRoutes(ctx, playerId) {
  return (await ctx.database.get('players', { qid: playerId }, ['playRoutes']))[0].playRoutes
}

async function getTech(ctx, playerId) {
  let techs_get = (await ctx.database.get('players', { qid: playerId }, ['techs']))[0].techs
  return `创${techs_get[0]}富${techs_get[1]}延${techs_get[2]}强${techs_get[3]}`
}

async function getGroup(ctx, playerId) {
  return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
}

async function formatted_playerdata(ctx, session) {
  return `@${session.author.name}\n科技: ${await getTech(ctx,qqid)}\n集团: ${await getGroup(ctx,qqid)}`
}

function drs_timer(drs_num) {
  return `这是一个显示踢出计时器的占位符`
}

function getQQid(session) {
  if (!session.onebot)
    return defaultQQid
  return +session.author.id
}

function existNaN(...nums) {
  nums.forEach(num => {
    if (isNaN(num)) return true
  });
  return false
}
