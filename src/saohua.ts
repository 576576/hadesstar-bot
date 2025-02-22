import { Context, Random, Schema, Session } from 'koishi'

let saohua = ['大哥你去哪了，我是你的小张飞呀!', '义父你去哪了，我是你的小奉先呀!']
//随机骚话模块
export function saohuaTalk(ctx: Context) {
    ctx.on('message', async (session) => {
        ctx.command('你是谁')
            .action(async (_) => {
                session.send(saohua[Math.floor(Math.random() * saohua.length)])
            })
    })
}