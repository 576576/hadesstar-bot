import { Context, Schema } from 'koishi'
import * as fs from 'fs/promises'
import * as path from 'path'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

var d7 = [], d8 = [], d9 = [], d10 = [], d11 = [], d12 = []
var drs_lines = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, d7, d8, d9, d10, d11, d12]
var drs_number

declare module 'koishi' {
  interface Tables {
    players: Players
  }
}

// 这里是新增表的接口类型
export interface Players {
  id: number
  qid: number
  licence: number
  playRoutes: Array<number>
  tech: Array<number>
  group: string
}

export function apply(ctx: Context) {

  // 初始化数据库
  const root = path.join(ctx.baseDir, 'data', 'hadesstar-bot')
  fs.mkdir(root, { recursive: true })
  // 数据库各字段的类型声明
  ctx.database.get('players', {})
  ctx.model.extend('players', {
    id: 'unsigned',
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
    tech: {
      type: 'array',
      initial: [0, 0, 0, 0],
      nullable: true,
    },
    group: {
      type: 'string',
      initial: '无集团',
      nullable: true,
    },
  })

  //主监听用户输入
  ctx.on('message', async (session) => {
    let qqid = +session.author.id
    await ctx.database.get('players', { qid: qqid }, ['id'])

    //测试 cs
    if (session.content === 'cs') session.send("ok")

    //加入三人组队 D[7-9]
    if (session.content[0] == 'D' && session.content.length <= 3) {
      drs_number = +session.content.substring(1)
      if (isValidDrsNum(drs_number))
        join_drs(ctx, session)
    }

    //退出组队 TC
    if (session.content === 'TC') {
      quit_drs(session)
    }

    //查询组队情况 CK[7-9 optional]
    if (session.content.substring(0, 2) === 'CK') {
      if (session.content === 'CK') {
        for (var i = 7; i <= 12; i++) {
          session.send(formatted_DrsN(ctx, drs_number))
        }
      }
      else {
        drs_number = +session.content.substring(2)
        if (isValidDrsNum(drs_number)) {
          session.send(formatted_DrsN(ctx, drs_number))
        }
      }
    }

    //查询个人信息 CX
    if (session.content.substring(0, 2) === 'CX') {
      if (session.content === 'CX')
        session.send(formatted_playerdata(session))
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
          await ctx.database.upsert('players', () => [
            { qid: qqid, tech: techs },
          ])
          session.send(`已录入创${techs[0]}富${techs[1]}延${techs[2]}强${techs[3]}`)
        }
      }
      else if (session.content.substring(2, 7) == '常驻集团 ') {
        let player_group = session.content.substring(7)
        if (player_group != '') {
          await ctx.database.upsert('players', () => [
            { qid: qqid, group: player_group },
          ])
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

function join_drs(ctx, session) {
  let drs_num = find_drs(session)
  if (drs_num == 0) {
    drs_lines[drs_number].push(session.author)
    var drs_message = `${session.author.name} 成功加入D${drs_number}队伍\n——————————————\n发车人数 [${drs_lines[drs_number].length}/3]\n——————————————\n${formatted_DrsN(ctx, drs_number)}\n——————————————\n`
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
  drs_number = find_drs(session)
  if (drs_number != 0) {
    drs_lines[drs_number].splice(drs_lines[drs_number].indexOf(session.author))
    session.send(`${session.author.name} 已退出D${drs_number}列队`)
  }
  else session.send("你未在队伍中")
}

function find_drs(session) {
  let drs_num = 0
  drs_lines.forEach(drs_level => {
    if (drs_level.includes(session.author)) {
      session.send(drs_lines.indexOf(drs_level))
      drs_num = drs_lines.indexOf(drs_level)
    }
  });
  return drs_num
}

function isValidDrsNum(drs_num) {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

function formatted_DrsN(ctx, drs_num) {
  if (drs_lines[drs_num].length == 0) return `D${drs_num}队列为空`
  let drs_message = ``
  drs_lines[drs_num].forEach(player => {
    drs_message +=
      `╔@${player.name}  ${getPlayRoutes(ctx, player)}\n╚［${getTech(ctx, player)}］\n`
  });
  return drs_message
}

function getPlayRoutes(ctx, player) {
  return ctx.database.get('players', { qid: +player.id }, ['playRoutes'])
}

function getTech(ctx, player) {
  let techs = ctx.database.get('players', { qid: +player.id }, ['tech'])
  return `创${techs[0]}富${techs[1]}延${techs[2]}强${techs[3]}`
}

function formatted_playerdata(session) {
  return `这是一个显示个人信息的占位符`
}

function drs_timer(drs_num) {
  return `这是一个显示踢出计时器的占位符`
}

function existNaN(...nums) {
  nums.forEach(num => {
    if (isNaN(num)) return true
  });
  return false
}
