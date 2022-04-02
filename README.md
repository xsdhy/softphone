# WebRTC Phone Used By JsSIP
本项目为基于JsSIP实现的webrtc软电话条，可以对接opensips、freeswitch

## 安装构建
```
yarn

yarn build
```

## 文档说明
### 1.初始化SDK 
初始化加载sdk

#### 参数说明：

| 参数 | 说明 | 是否必填 |
| --- | --- | ----- |
| host | 服务器地址 | 必填项 |
| port | 服务器端口 | 必填项 |
| proto | bool类型 true/false，使用wss或者ws协议 | 不填，默认为ws协议 |
| extNo | 分机账号 | 必填项 |
| extPwd | 分机密码 | 必填项 |
| stateEventListener | 状态回调函数方法 参照文档最下方stateEventListener详细说明 | 需注入状态回调 |
| autoRegister | bool类型 true/false，initSDK调用后是否自动注册 | 不填默认为false |


#### 使用样例：
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

### 2. 销毁SDK
关闭销毁sdk

#### 使用样例：
```
Ctibar.cleanSDK()
```


### 3. 注册
分机注册register

#### 使用样例：
```
Ctibar.register()
```

### 4. 取消注册
取消分机注册

#### 使用样例：
```
Ctibar.unregister()
```

### 5. 呼叫请求
发起呼叫请求

#### 参数说明：

| 参数 | 说明 | 是否必填 |
| --- | --- | ----- |
| phone | 真实外呼需要传的参数，请再调用前去除不必要的字符，如空格、- 等特殊符合 | 必填项 |

#### 使用样例：
```
Ctibar.makecall(phone)
```

### 6. 挂断电话
挂断电话

#### 使用样例：
```
Ctibar.hangup()
```

### 7. 应答接听
接起通话

#### 使用样例：
```
Ctibar.answer()
```

### 8. 保持
通话保持，一端播放音乐

#### 使用样例：
```
Ctibar.hold()
```

### 9. 取消保持
取消通话保持

#### 使用样例：
```
Ctibar.unhold()
```

### 10. 转接通话
通话转接,挂断自己转接至第三方

#### 参数说明：

| 参数 | 说明 | 是否必填 |
| --- | --- | ----- |
| phone | 真实转接需要传的参数，请再调用前去除不必要的字符，如空格、- 等特殊符合 | 必填项 |

#### 使用样例：
```
Ctibar.transfer(phone)
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
