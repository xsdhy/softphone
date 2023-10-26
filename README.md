# 话务条([demo](https://softphone.xsdhy.com/))
本项目是基于JsSIP实现的webrtc软电话条、话务条。不依赖于其他业务系统，支持直接对接opensips、freeswitch。
支持react、vue、jquery、原生js。

## 接入指南

### 安装

#### 使用 npm 或 yarn 安装#
我们推荐使用 npm 或 yarn 的方式进行开发，不仅可在开发环境轻松调试，也可放心地在生产环境打包部署使用，享受整个生态圈和工具链带来的诸多好处。
```bash
npm install sip-call --save
yarn add sip-call
```
#### 浏览器引入
在浏览器中使用 script 和 link 标签直接引入文件，并使用全局变量 SipCall。
我们在 npm 发布包内的 sip-js/lib 目录下提供了[ bundle.browser.js](https://github.com/xsdhy/softphone/releases)

```javascript
<script src="lib/bundle.browser.js"></script>
```
也可以点击这里进行下载：https://github.com/xsdhy/softphone/releases

### 快速上手

#### 初始化
```javascript
//设置回调函数，主要是会回调一些时间，比如说注册、来电之类的
let stateEventListener = (event, data) => {
		switch(event){
    case "ERROR":
    break
    case "CONNECTED":
    break
    default:
    }
}
//设置配置信息
let config = {
    host: '10.133.35.89',
    port: '5066',
    proto: true,
    extNo: '1001',
    extPwd: '123456',
    autoRegister: true,
    stateEventListener: stateEventListener
}
//初始化
this.sipClient = new SipCall(config)
```
#### 呼叫
```javascript
this.sipClient.call("17300000001")
```

## 流程说明

### 1、初始化
1）、检查麦克风权限
2）、调用初始化方法
this.sipClient = new SipCall(config)，建议用户登录业务系统的时候就进行初始化，要求全局唯一，切记不能每次拨打电话的时候都初始化一次。
3）、收到回调事件「REGISTERED」表示注册成功。错误处理：监听事件，收到「DISCONNECTED」、「REGISTER_FAILED」做出相应提示

### 2、呼叫
请注意只有当收到回调事件「REGISTERED」后，才能进行后续操作
1）、检查麦克风权限
2）、调用呼叫方法this.sipClient.call("17300000001")
3）、收到「OUTGOING_CALL」事件，表示呼出中
4）、如果被叫接听，则会收到「IN_CALL」事件
5）、任意一方挂机，触发「CALL_END」事件



## 文档说明

提供如下方法：

| 函数    | 调用方式                     | 说明         |
|-------|--------------------------|------------|
| 初始化   | new SipCall(config)    |            |
| 销毁SDK | cleanSDK()         |            |
| 检查麦克风 | micCheck() | 异步接口，若麦克风异常会回调MIC_ERROR事件 |
| 注册    | register()         |            |
| 取消注册  | unregister()       |            |
| 呼叫请求  | call(phone,extraParam={}) | phone为外呼号码，extraParam为可选的扩展参数（可以不传） |
| 挂断电话  | hangup()           |            |
| 应答接听  | answer()           |            |
| 保持    | hold()             |            |
| 取消保持  | unhold()           |            |
| 转接通话  | transfer(phone)    |            |
| 按键 | sendDtmf(tone) | 按键或二次拨号 |

以下对几个特殊的方法进行说明：

### 初始化SDK

初始化加载sdk的参数说明：

| 参数                 | 说明                                     | 是否必填       |
|--------------------|----------------------------------------|------------|
| host               | 服务器地址                                  | 必填项        |
| port               | 服务器端口                                  | 必填项        |
| proto              | bool类型 true/false，使用wss或者ws协议          | 不填，默认为ws协议 |
| extNo              | 分机账号                                   | 必填项        |
| extPwd             | 分机密码                                   | 必填项        |
| stateEventListener | 状态回调函数方法 参照文档最下方stateEventListener详细说明 | 需注入状态回调    |
| autoRegister       | bool类型 true/false，initSDK调用后是否自动注册     | 不填默认为false |


### 呼叫 call

call方法完整的使用示例如下
```
let callUUID = this.sipClient.call("17300000001",{"businessId":"自定义参数(最多100个字符)"})
```
其中：
入参，第一个参数为必填，第二个参数为可选的扩展参数
出参，callUUID表示通话的唯一标识，与话单中的uuid一致


### 状态回调（stateEventListener）

前端注入状态回调函数，通过状态回调 控制页面按钮显示

stateEventListener回调参数为 event, data

| Event事件列表                   | 返回值                                                                                                                                      | 状态说明          |
|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| MIC_ERROR                   | {msg: xxxx}                                                                                                                              | 麦克风检测异常       |
| ERROR                       | {msg: xxxx}                                                                                                                              | 错误异常          |
| CONNECTED                   | {localAgent: '1001'}                                                                                                                     | 连接成功          |
| DISCONNECTED                | 无返回值                                                                                                                                     | websocket连接失败 |
| REGISTERED                  | 无返回值                                                                                                                                     | 注册成功          |
| UNREGISTERED                | 无返回值                                                                                                                                     | 取消注册          |
| REGISTER_FAILED             | {msg: xxxx}                                                                                                                              | 注册失败          |
| INCOMING_CALL/OUTGOING_CALL | {direction: 'inbound', otherLegNumber: '138xxxxxxxx', 'callId': 'xxxxxxx'} 说明：direction为呼叫方向：inbound呼入，outbound呼出；otherLegNumber：第三方呼叫记录 | 呼入振铃/外呼响铃     |
| IN_CALL                     | 无返回值                                                                                                                                     | 通话中           |
| HOLD                        | 无返回值                                                                                                                                     | 保持中           |
| CALL_END                    | 无返回值                                                                                                                                     | 通话结束          |
