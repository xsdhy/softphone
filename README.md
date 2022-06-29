# 话务条([demo](https://softphone.xsdhy.com/))
本项目为基于JsSIP实现的webrtc软电话条、话务条，可以对接opensips、freeswitch。

## 使用说明

index.html只是调用示例，src/index.js才是sdk源文件  
通过以下方式构建
```
yarn && yarn build
```
构建后会在dist目录下生成ctibar.js，引入到自己项目中即可


## 文档说明

提供如下方法：

| 函数    | 调用方式和                         | 说明         |
|-------|-------------------------------|------------|
| 初始化   | Ctibar.initSDK(config)        |            |
| 销毁SDK | Ctibar.cleanSDK()             |            |
| 注册    | Ctibar.register()             |            |
| 取消注册  | Ctibar.unregister()           |            |
| 呼叫请求  | Ctibar.makecall(phone) | 真实外呼需要传的参数 |
| 挂断电话  | Ctibar.hangup()               |            |
| 应答接听  | Ctibar.answer()               |            |
| 保持    | Ctibar.hold()                 |            |
| 取消保持  | Ctibar.unhold()               |            |
| 转接通话  | Ctibar.transfer(phone)        |            |

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

使用样例：

```
let config = {
    host: '10.133.35.89',
    port: '5066',
    proto: false,
    extNo: '1001',
    extPwd: '123456',
    autoRegister: true,
    stateEventListener: stateEventListener
}
Ctibar.initSDK(config)
```


### 状态回调（stateEventListener）

前端注入状态回调函数，通过状态回调 控制页面按钮显示

stateEventListener回调参数为 event, data

| Event事件列表                   | 返回值                                                                                                                                      | 状态说明          |
|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| MICERROR                    | {msg: xxxx}                                                                                                                              | 麦克风检测异常       |
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

```
const stateEventListener = (event, data) => {
switch(event){
    case "ERROR":
    
    break
    case "CONNECTED":
    
    break
    
    ......
    
    default:
    
    }
}
```
