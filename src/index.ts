import { Context, Schema } from 'koishi'

export const name = 'hadesstar-bot'

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

var d7 = new Array(), d8 = new Array(), d9 = new Array(), d10 = new Array(), d11 = new Array(), d12 = new Array()
var drs_lines = [, , , , , , , d7, d8, d9, d10, d11, d12]
var drs_number

export function apply(ctx: Context) {
  ctx.on('message', (session) => {

    //测试
    if (session.content === 'cs') session.send("ok")

    //加入三人组队
    if (session.content[0] == 'D' && session.content.length <= 3) {
      drs_number = +session.content.substring(1)
      if (isValidDrsNum(drs_number))
        join_drs(session)
    }

    //退出组队
    if (session.content === 'TC') {
      quit_drs(session)
    }

    //查询组队情况
    if (session.content.substring(0,1) === 'CK') {
      if(session.content === 'CK')
        session.send(drs_lines.toString())
      else{
        drs_number = +session.content.substring(2)
        if(isValidDrsNum(drs_number)){
          return formatted_DrsN(drs_number)
        }
      }
    }
  })
}

function join_drs(session) {
  let drs_num = find_drs(session)
  if (drs_num==0) {
    drs_lines[drs_number].push(session.author.id)
    var drs_message = `@${session.author.id} 成功加入D${drs_number}队伍\n——————————————\n发车人数 [${drs_lines[drs_number].length}/3]`
    session.send(drs_message)
    return
  }
  else if (drs_num==drs_number)
    session.send(`你已在D${drs_number}队伍中`)
  else {
    let drs_num = drs_number
    quit_drs(session)
    drs_number = drs_num
    join_drs(session)
  }
}

function quit_drs(session) {
  drs_number = find_drs(session)
  if (drs_number != 0) {
    drs_lines[drs_number].splice(drs_lines[drs_number].indexOf(session.author.id))
    session.send(`@${session.author.id} 已退出D${drs_number}列队`)
  }
  else session.send("你未在队伍中")
}

function find_drs(session) {
  drs_lines.forEach(drs_level => {
    if (drs_level.includes(session.author.id)) {
      return drs_lines.indexOf(drs_level)
    }
  });
  return 0
}

function isValidDrsNum(drs_num){
  return !isNaN(drs_number) && drs_number >= 7 && drs_number <= 12
}

function formatted_DrsN(drs_num){
  return drs_lines[drs_number].toString
}