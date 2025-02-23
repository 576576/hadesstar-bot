import { Context, Schema, Session } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'
import { getQQid,isValidDrsNum,existNaN} from './utils'

export const inject = ['database']

declare module 'koishi' {
    interface Tables {
        elines: RsEventLines
    }
}

export interface RsEventLines {
    qid: number
    totalScore: number
    cachedLines: number[]
}

export function loadRsEventFunction(ctx: Context,session:Session) {
    // 初始化表elines
    ctx.model.extend('elines', {
        qid: {
            type: 'integer',
            length: 18,
            initial: 0,
            nullable: false,
        },
        totalScore: {
            type: 'integer',
            length: 5,
            initial: 0,
            nullable: false,
        },
        cachedLines: {
            type: 'array',
            initial: [],
            nullable: false,
        },
    }, {
        primary: 'qid',
        autoInc: false,
    })

        //加入单人红活 HS<7-12>
        ctx.command('HS <arg>')
        .alias('HS7', { args: ['7'] }).alias('HS8', { args: ['8'] }).alias('HS9', { args: ['9'] })
        .alias('HS10', { args: ['10'] }).alias('HS11', { args: ['11'] }).alias('HS12', { args: ['12'] })
        .action(async (_, arg) => {
          if (isValidDrsNum(+arg)) {
            await join_rs_event(ctx, session, `HS${arg}`)
          }
        })

    async function join_rs_event(ctx: Context, session: Session, joinType: string): Promise<void> {
    //   let lineLevel = (+joinType.substring(1))
    //   let foundType = await findDrsFromId(ctx, session, qqid)
    //   if (foundType == 'K0') {
    //     await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType }])
    //     let dinfo = await findIdFromDrs(ctx, joinType)
    //     let lineNum = dinfo.length
    //     let lineMaximum = joinType.indexOf('K') != -1 ? 2 : 3
    //     var drs_message = `${session.author.name} 成功加入${joinType}队伍\n——————————————\n发车人数 [${lineNum}/${lineMaximum}]\n——————————————\n${await formatted_DrsN(ctx, session, joinType)}——————————————\n`
    
    //     //发车
    //     if (lineNum >= lineMaximum) {
    //       drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${joinType.substring(1)}  ]`
    //       //发车后清空队伍
    //       for (const driverId of dinfo) {
    //         let tmp = (await ctx.database.get('players', { qid: driverId }))[0].playRoutes
    //         tmp[lineLevel - 7] += 1
    //         await ctx.database.upsert('players', () => [{ qid: qqid, playRoutes: tmp }])
    //       }
    //       await ctx.database.remove('dlines', { lineType: joinType })
    //     }
    //     else drs_message += drs_timer(joinType)
    //     await session.sendQueued(drs_message)
    //     return
    //   }
    //   else if (foundType == joinType)
    //     await session.sendQueued(`你已在${joinType}队伍中`)
    //   else {
    //     let drs_num = drs_number
    //     await quit_drs(ctx, session)
    //     drs_number = drs_num
    //     await join_rs_event(ctx, session, joinType)
    //   }
    }
}