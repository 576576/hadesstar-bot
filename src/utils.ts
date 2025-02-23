import { Session } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'

//初始化各种变量
var defaultQQid = 0, defaultName = '巨蛇座星雲', defaultWaitDueTime = 20 * 6e4


export function getQQid(session: Session): number {
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

export function isValidDrsNum(drs_num: number): boolean {
    return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

export function existNaN(...nums: number[]): boolean {
    nums.forEach(num => {
        if (isNaN(num)) return true
    });
    return false
}