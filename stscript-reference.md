# STscript 完整参考手册

> **版本基线**: SillyTavern 1.17.0  
> **文档类型**: 统一 STscript 主参考文档  
> **最后更新**: 2026-04-23

本文档是 STscript 的统一参考文档，供助手和排查场景直接查阅。

---

## 核心特性与渲染指南

### 功能简述

小白X的代码渲染功能可将聊天中包含HTML标签(完整的`<html>`, `<!DOCTYPE>`或单独的`<script>`)的代码块将其渲染为可交互iframe,iframe高度为自适应。
- HTML 内容需要在 \`\`\` 包裹的代码块中，并包含 `<html>`、`<!DOCTYPE>` 或 `<script>` 标签才会被渲染。

### 启用功能

在酒馆中打开 扩展设置 → 小白X扩展 → 小白X模板 → 勾选开启`总开关`及`渲染`；

## STscript 函数
我们可以使用`STscript()`异步函数来调用SillyTavern的Slash命令：
- `STscript()`是调用酒馆命令的异步函数。当卡片需要发起 AI API 生成请求时，可以使用 `await STscript('/gen [参数们]');`，参数具体参考下面的命令定义。

本文档包含：
- STscript 基础语法与参数规则
- 转义、引号、数据类型与常见写法
- 完整命令索引
- 主要命令的参数、返回值与示例

---

## 目录

1. [如何使用本文档](#如何使用本文档)
2. [语法基础](#语法基础)
3. [参数系统](#参数系统)
4. [转义与引号规则](#转义与引号规则)
5. [数据类型详解](#数据类型详解)
6. [命令索引](#命令索引)
7. [命令详细定义](#命令详细定义)

---

## 如何使用本文档

- 查 STscript 是什么、命令怎么组成、管道怎么传值：先看“语法基础”
- 查参数怎么写、值类型是什么：先看“参数系统”
- 查引号、空格、JSON、闭包怎么写不报错：先看“转义与引号规则”
- 查某个命令叫什么、参数有哪些、返回什么：先看“命令索引”，再跳到“命令详细定义”

这份文档的主体是命令字典；前面的基础章节用于帮助你正确理解和使用后面的命令定义。

---

## 语法基础

### 命令结构

```stscript
/command-name namedArg=value namedArg2="quoted value" unnamed argument text
```

组成部分：
- `/command-name`：命令名，必须以 `/` 开头
- `namedArg=value`：命名参数
- `unnamed argument text`：未命名参数或剩余文本

### 管道系统

| 符号 | 作用 | 示例 |
|------|------|------|
| `\|` | 将前一命令输出传给后一命令 | `/gen 用一句话写个故事 \| /inject` |
| `\|\|` | 断开自动管道传递 | `/gen A \|\| /gen B` |
| `{{pipe}}` | 显式引用当前管道值 | `/gen 续写以下内容：{{pipe}}` |

---

## 参数系统

### 参数类型

STscript 支持两种主要参数形式：

#### 1. 命名参数

格式：`key=value`

- 顺序通常无关
- 适合可选配置项
- 支持引号：`key="value with spaces"`

#### 2. 未命名参数

- 与位置相关
- 常用作命令的主要输入
- 某些命令会捕获剩余全部文本

### 参数值类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `STRING` | 字符串 | `text="Hello"` |
| `NUMBER` | 数字 | `count=5` |
| `BOOLEAN` | 布尔值 | `enabled=true` |
| `LIST` | 数组 | `items=["a","b"]` |
| `DICTIONARY` | 对象 | `data={"key":"value"}` |
| `CLOSURE` | 闭包 | `callback={: /gen done :}` |
| `RANGE` | 范围 | `5-10` |
| `VARIABLE_NAME` | 变量名 | `myVar` |

---

## 转义与引号规则

### 基本规则

- 含空格的值应使用引号包裹：`name="Hello World"`
- JSON 数组和对象应保持合法 JSON 格式
- 命名参数里的字符串若包含引号，需要做转义
- 闭包内部仍按 STscript 继续解析，不是普通原样字符串

示例：

```stscript
/gen text="Hello World"
/createentry file=chatLore {"content":"新条目","key":["测试"]}
/gen stop=["。","！"] "好的，我明白了"
```

### 闭包内的规则

- 闭包使用 `{: ... :}` 包裹
- 闭包内可以继续写多条命令
- 若命令本身也需要引号或 JSON，要同时满足闭包与命令自身语法

```stscript
/gen stop=["。"] "续写：{: /gen 继续故事 :}"
```

---

## 命令索引

### LLM交互命令
- [/gen](#gen) - 生成文本
- [/genraw](#genraw) - 原始生成
- [/stop](#stop) - 停止生成
- [/tokens](#tokens) - 统计token数

### 提示注入命令
- [/inject](#inject) - 注入提示
- [/listinjects](#listinjects) - 列出注入
- [/flushinject](#flushinject) - 清除注入

### 世界信息命令
（在 world-info.js 中定义）
- [/world](#world) - 管理世界书
- [/getchatbook](#getchatbook) - 获取聊天世界书
- [/getglobalbooks](#getglobalbooks) - 获取全局世界书
- [/getpersonabook](#getpersonabook) - 获取人格世界书
- [/getcharbook](#getcharbook) - 获取角色世界书
- [/findentry](#findentry) - 查找条目
- [/getentryfield](#getentryfield) - 获取条目字段
- [/setentryfield](#setentryfield) - 设置条目字段
- [/createentry](#createentry) - 创建条目

## 命令详细定义

### /setentryfield

设置世界信息条目的字段值。

**别名**: `/setlorefield`, `/setwifield`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `file` | STRING | **是** | - | 世界书名称 |
| `uid` | STRING | **是** | - | 条目 UID |
| `field` | STRING | 否 | `content` | 字段名 |

**可用字段列表**:

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `key` | array | `[]` | 主关键词数组 |
| `keysecondary` | array | `[]` | 次要关键词数组 |
| `comment` | string | `''` | 标题/备注 |
| `content` | string | `''` | 内容 |
| `constant` | boolean | `false` | 常量状态 |
| `vectorized` | boolean | `false` | 向量化状态 |
| `selective` | boolean | `true` | 选择性触发 |
| `selectiveLogic` | enum | `0` | 逻辑（0=AND_ANY, 1=NOT_ALL, 2=NOT_ANY, 3=AND_ALL） |
| `addMemo` | boolean | `false` | 添加备忘录 |
| `order` | number | `100` | 顺序 |
| `position` | number | `0` | 位置（0-6） |
| `disable` | boolean | `false` | 禁用状态 |
| `ignoreBudget` | boolean | `false` | 忽略预算 |
| `excludeRecursion` | boolean | `false` | 排除递归 |
| `preventRecursion` | boolean | `false` | 防止递归 |
| `matchPersonaDescription` | boolean | `false` | 匹配人格描述 |
| `matchCharacterDescription` | boolean | `false` | 匹配角色描述 |
| `matchCharacterPersonality` | boolean | `false` | 匹配角色性格 |
| `matchCharacterDepthPrompt` | boolean | `false` | 匹配深度提示 |
| `matchScenario` | boolean | `false` | 匹配场景 |
| `matchCreatorNotes` | boolean | `false` | 匹配创作者笔记 |
| `delayUntilRecursion` | number | `0` | 延迟递归 |
| `probability` | number | `100` | 触发概率（0-100） |
| `useProbability` | boolean | `true` | 使用概率 |
| `depth` | number | `4` | 深度 |
| `outletName` | string | `''` | 出口名称 |
| `group` | string | `''` | 组 |
| `groupOverride` | boolean | `false` | 组覆盖 |
| `groupWeight` | number | `100` | 组权重 |
| `scanDepth` | number? | `null` | 扫描深度 |
| `caseSensitive` | boolean? | `null` | 区分大小写 |
| `matchWholeWords` | boolean? | `null` | 匹配整词 |
| `useGroupScoring` | boolean? | `null` | 使用组评分 |
| `automationId` | string | `''` | 自动化ID |
| `role` | enum | `0` | 角色 |
| `sticky` | number? | `null` | 粘性（限时效果） |
| `cooldown` | number? | `null` | 冷却（限时效果） |
| `delay` | number? | `null` | 延迟 |
| `characterFilterNames` | array | `[]` | 角色过滤器名称 |
| `characterFilterTags` | array | `[]` | 角色过滤器标签 |
| `characterFilterExclude` | boolean | `false` | 角色过滤器排除 |
| `triggers` | array | `[]` | 触发器 |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 是 | 字段值 |

**返回值**: 空字符串

**示例**:

```stscript
/setentryfield file=chatLore uid=123 field=content 这是新内容
/setentryfield file=chatLore uid=123 field=key 关键词1,关键词2
/setentryfield file=chatLore uid=123 field=constant true
/setentryfield file=chatLore uid=123 field=probability 50
```

---

---

### /gen

生成文本（带角色设定和聊天上下文）。

**别名**: 无

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `trim` | BOOLEAN | 否 | `false` | `true`, `false` | 按最后完整句裁剪输出 |
| `lock` | BOOLEAN | 否 | - | `on`, `off` | 生成时锁定用户输入 |
| `name` | STRING | 否 | `System` | - | instruct模式中的提示内名字或角色标识符 |
| `length` | NUMBER | 否 | - | - | API响应上限长度（token数，建议30000以上） |
| `as` | STRING | 否 | `system` | `system`, `char` | 输出提示的角色 |
| `stop` | LIST | 否 | - | - | 自定义停止字符串（JSON数组） |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 是 | 生成提示 |

**返回值**: 生成的文本

**示例**:

```stscript
/gen 用一句话描述今天的天气
/gen lock=on name=Assistant 写一首诗
/gen as=char length=100 继续故事
```

---

### /genraw

原始文本生成（忽略角色和聊天上下文）。

**别名**: 无

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `lock` | BOOLEAN | 否 | `off` | `on`, `off` | 生成时锁定用户输入 |
| `stop` | LIST | 否 | - | - | 自定义停止字符串（JSON数组） |
| `instruct` | BOOLEAN | 否 | `on` | `on`, `off` | 是否应用指令格式 |
| `as` | STRING | 否 | `system` | `system`, `char` | 提示格式化身份 |
| `system` | STRING | 否 | - | - | 附加系统提示 |
| `prefill` | STRING | 否 | - | - | 追加到提示结尾的预填文本 |
| `length` | NUMBER | 否 | - | - | API响应长度（token数） |
| `trim` | BOOLEAN | 否 | `on` | `on`, `off` | 去掉开头的用户/角色前缀 |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 是 | 生成提示 |

**返回值**: 生成的文本

**示例**:

```stscript
/genraw 用一句话描述今天的天气
/genraw lock=on stop=["。","！"] instruct=on 写一首诗
/genraw system="你是一个助手" prefill="好的，" 帮我写代码
```

---


### /stop

停止当前生成。

**别名**: 无

**未命名参数**: 无

**返回值**: 空字符串

**示例**:

```stscript
/stop
```

---

### /tokens

统计文本token数量。

**别名**: 无

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 是 | 要统计的文本 |

**返回值**: token数量（字符串格式的数字）

**示例**:

```stscript
/tokens Hello World
/tokens {{getvar::longText}} | /echo Token数: {{pipe}}
```

---

### /inject

注入自定义提示到LLM。

**别名**: 无

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `id` | STRING | 否 | 自动生成 | - | 注入ID（唯一标识） |
| `position` | STRING | 否 | `after` | `before`, `after`, `chat`, `none` | 注入位置 |
| `depth` | NUMBER | 否 | `4` | - | 注入深度 |
| `scan` | BOOLEAN | 否 | `false` | `true`, `false` | 是否包含在WI扫描中 |
| `role` | STRING | 否 | `system` | `system`, `assistant`, `user` | in-chat注入的角色 |
| `ephemeral` | BOOLEAN | 否 | `false` | `true`, `false` | 生成后移除注入 |
| `filter` | CLOSURE | 否 | - | - | 过滤闭包（返回true才注入） |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 否 | 注入文本 |

**返回值**: 注入ID

**示例**:

```stscript
/inject id=charState position=after [{{char}}当前状态：HP {{getvar::hp}}/100]
/inject position=chat depth=0 role=system 重要提示：保持角色
/inject ephemeral=true 这条注入只用一次
/inject id=temp
```

---

### /listinjects

列出当前聊天的所有注入。

**别名**: 无

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `return` | STRING | 否 | `popup-html` | `popup-html`, `pipe`, `object`, `chat-html`, `chat-text` | 返回方式 |

**未命名参数**: 无

**返回值**: 根据`return`参数决定

**示例**:

```stscript
/listinjects
/listinjects return=pipe
```

---

### /flushinject

清除注入。

**别名**: `/flushinjects`

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 否 | 注入ID（不提供则清除所有） |

**返回值**: 空字符串

**示例**:

```stscript
/flushinject charState
/flushinject
```

---

### /world

激活、停用或切换世界书。

**别名**: 无

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `state` | STRING | 否 | - | `on`, `off`, `toggle` | 世界书状态控制 |
| `silent` | BOOLEAN | 否 | `false` | - | 是否静默，不弹 toast |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 否 | 世界书名称 |

**返回值**: 通常为空字符串

**示例**:

```stscript
/world MyLorebook
/world state=off MyLorebook
```

---

### /getchatbook

获取聊天绑定的世界书名称；需要时可自动创建。

**别名**: `/getchatlore`, `/getchatwi`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `name` | STRING | 否 | - | 创建时使用的世界书名称 |
| `create` | BOOLEAN | 否 | `true` | 不存在时是否创建 |

**未命名参数**: 无

**返回值**: 世界书名称

**示例**:

```stscript
/getchatbook
/getchatbook name=chatLore create=true
```

---

### /getglobalbooks

获取当前选中的全局世界书列表。

**别名**: `/getgloballore`, `/getglobalwi`

**未命名参数**: 无

**返回值**: 已选全局世界书名称列表

**示例**:

```stscript
/getglobalbooks
```

---

### /getpersonabook

获取当前 persona 绑定的世界书名称。

**别名**: `/getpersonalore`, `/getpersonawi`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `name` | STRING | 否 | - | 创建时使用的世界书名称 |
| `create` | BOOLEAN | 否 | `false` | 不存在时是否创建 |

**未命名参数**: 无

**返回值**: 世界书名称；未绑定时可能为空字符串

**示例**:

```stscript
/getpersonabook
```

---

### /getcharbook

获取角色绑定的世界书名称。

**别名**: `/getcharlore`, `/getcharwi`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 可选值 | 说明 |
|--------|------|------|--------|--------|------|
| `type` | STRING | 否 | `primary` | `primary`, `additional`, `all` | 获取哪类角色世界书 |
| `name` | STRING | 否 | - | 创建时使用的世界书名称 |
| `create` | BOOLEAN | 否 | `false` | 不存在时是否创建 |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | NUMBER/STRING | 否 | 角色名或 avatar key；省略时使用当前角色 |

**返回值**: 世界书名称，或在 `all/additional` 模式下返回列表

**示例**:

```stscript
/getcharbook
/getcharbook type=all Alice
```

---

### /findentry

在指定世界书中按字段做模糊匹配，返回条目 UID。

**别名**: `/findlore`, `/findwi`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `file` | STRING | 是 | - | 世界书名称 |
| `field` | STRING | 否 | `key` | 用于模糊匹配的字段 |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1..n | STRING | 是 | 匹配文本 |

**返回值**: 条目 UID

**示例**:

```stscript
/findentry file=chatLore field=key Shadowfang
```

---

### /getentryfield

读取指定世界书条目的字段值。

**别名**: `/getlorefield`, `/getwifield`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `file` | STRING | 是 | - | 世界书名称 |
| `field` | STRING | 否 | `content` | 要读取的字段 |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 是 | 条目 UID |

**返回值**: 字段值

**示例**:

```stscript
/getentryfield file=chatLore field=content 123
```

---

### /createentry

在指定世界书中创建条目。

**别名**: `/createlore`, `/createwi`

**命名参数**:

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `file` | STRING | 是 | - | 世界书名称 |
| `key` | STRING | 否 | - | 条目 key |

**未命名参数**:

| 位置 | 类型 | 必需 | 说明 |
|------|------|------|------|
| 1 | STRING | 否 | 条目 content |

**返回值**: 新条目的 UID

**示例**:

```stscript
/createentry file=chatLore key=Shadowfang The sword of the king
```