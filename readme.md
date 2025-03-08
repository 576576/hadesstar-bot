# 巨蛇座星雲机器人 koishi-plugin-hadesstar-bot

[![npm](https://img.shields.io/npm/v/koishi-plugin-hadesstar-bot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-hadesstar-bot)

hadesstar-bot是仙女座星雲冥王星bot的ts实现.

## 实现功能

详细指令用法请参考[指令列表](commandlist.md)

### 仙女座bot标准功能指令

- 玩家管理
  - 授权车牌(管理)
  - 重置玩家(管理)
  - 录入游戏信息
  - 查询游戏信息

- 暗红星队列
  - 排队(三人/双人)
  - 退出排队
  - 查询某队列人数

- 红星活动
  - 开关红活(管理)
  - 重置红活(管理)
  - 生成红活排行
  - 加入红活行动
  - 录入红活行动分数
  - 查询红活分数

- 杂项
  - 随机骚话系统

### 适配adapter-qq的额外指令

仅在适配qq开放平台运行时,以下指令有效.

- 玩家管理
  - 初始化玩家(管理)

## 环境配置

本插件依赖[Koishi](https://koishi.chat/)框架运行,并需要以下依赖项

- database
- adapter-qq
<!-- - adapter-onebot (二选一) -->
