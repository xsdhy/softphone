/***
 * 基于jssip v3.9.0 实现webrtc SDK
 * 开发时间: 2022-03-08
 * Auth Shen TianYu
 */
var JsSIP = require('jssip')
const {newUUID} = require("jssip/lib/Utils");


//状态常量
const MICERROR = "MICERROR"                 //麦克风检测异常
const ERROR = "ERROR"                       //错误操作或非法操作
const CONNECTED = "CONNECTED"               //websocket已连接
const DISCONNECTED = "DISCONNECTED"         //websocket已断开连接
const REGISTERED = "REGISTERED"             //已注册
const UNREGISTERED = "UNREGISTERED"         //取消注册
const REGISTER_FAILED = "REGISTER_FAILED"   //注册失败
const INCOMING_CALL = "INCOMING_CALL"       //呼入振铃
const OUTGOING_CALL = "OUTGOING_CALL"       //外呼中
//const RINGING = "RINGING"                 //呼叫振铃
const IN_CALL = "IN_CALL"                   //通话中
const HOLD = "HOLD"                         //保持中
const CALL_END = "CALL_END"                 //通话结束

//本地媒体流
var localStream = null;
//创建audio控件并且自动播放
const audioView = document.createElement('audio')
audioView.autoplay = true;

//媒体控制
const constraints = {
    audio: true,
    video: false
}

const getLocalMedia = (stream) => {
    localStream = stream;
    audioView.src = URL.createObjectURL(stream)
}

const captureLocalMedia = () => {
    navigator.getUserMedia(constraints, getLocalMedia, (e) => {
        console.error('getUserMedia() err: ' + e.name)
    })
}

//处理音频播放
const handleAudio = (pc) => {
    pc.onaddstream = (media) => {
        let remoteStream = media.stream;
        if (remoteStream.active) {
            audioView.srcObject = remoteStream;
        }
    }
}


let eventHandlers = {
    //回铃音处理
    peerconnection: (e) => {
        let pc = e.peerconnection
        handleAudio(pc)
    }
};

//jssip.UA
//jssip.WebSocket
let ua, socket
//登录后是否自动注册
let autoRegister = false;
//设置是否开启麦克风检测
let checkMic = false;

//呼叫中session管理
let outgoingSession, incomingSession, currentSession
//呼叫方向 outbound:呼出/inbound:呼入
let direction
//当前坐席号码
let localAgent
//对方号码
let otherLegNumber
//当前通话uuid
let currentCallId;

//清理全局变量
const cleanGlobalCallData = () => {
    outgoingSession = null
    incomingSession = null
    currentSession = null
    direction = null
    otherLegNumber = null
    currentCallId = null
}

//注册状态回调函数
let stateEventListener
const onChangeState = (event, data) => {
    stateEventListener(event, data)
}


//check当前通话是否存在
const checkCurrentCallIsActive = () => {
    if (!currentSession || !currentSession.isEstablished()) {
        let msg = '当前通话不存在或已销毁，无法执行该操作。'
        console.error(msg)
        onChangeState(ERROR, {msg: msg})
        return false
    }
    return true
}

//初始化SDK
const initSDK = (config) => {
    //初始化变量
    let host = config.host
    let port = config.port
    let proto = config.proto ? 'wss' : 'ws'
    let extNo = config.extNo
    let extPwd = config.extPwd;
    let domain = host;
    if (undefined !== config.domain && config.domain.length>0){
        domain = config.domain;
    }

    //注入状态回调函数
    if (config.stateEventListener !== null) {
        stateEventListener = config.stateEventListener
    }
    //注入是否自动注册
    autoRegister = config.autoRegister

    //麦克风检测开启
    if(config.checkMic){
        //执行麦克风检测报错
        micCheck()
    }

    if(config.debug){
        JsSIP.debug.enable('JsSIP:*');
    }else {
        JsSIP.debug.disable()
    }


    //坐席号码
    localAgent = extNo
    // JsSIP.C.SESSION_EXPIRES=120,JsSIP.C.MIN_SESSION_EXPIRES=120;
    let wsServer = proto + '://' + host + ':' + port
    socket = new JsSIP.WebSocketInterface(wsServer)
    var configuration = {
        sockets: [socket],
        // uri: 'sip:' + extNo + '@' + host,
        uri: 'sip:' + extNo + '@' + domain,
        password: extPwd,
        register: false,
        register_expires: 300,
        user_agent: 'JsSIP'
    }
    ua = new JsSIP.UA(configuration)

    //websocket连接成功
    ua.on('connected', (e) => {
        onChangeState(CONNECTED, {localAgent: localAgent})
        //自动注册
        if (autoRegister) {
            ua.register();
        }
    })

    //websocket连接失败
    ua.on('disconnected', (e) => {
        onChangeState(DISCONNECTED)
    })

    //注册成功
    ua.on('registered', (e) => {
        onChangeState(REGISTERED)
    })
    //取消注册
    ua.on('unregistered', (e) => {
        onChangeState(UNREGISTERED)
    })
    //注册失败
    ua.on('registrationFailed', (e) => {
        console.error(e)
        let msg = '注册失败,请检查账号密码是否正确。' + e.cause
        onChangeState(REGISTER_FAILED, {msg: msg})
    })
    //Fired a few seconds before the registration expires. If the application does not set any listener for this event,
    // JsSIP will just re-register as usual.
    ua.on('registrationExpiring', (e) => {
        ua.register()
    })

    //电话事件监听
    ua.on('newRTCSession', (data) => {
        console.info('on new rtcsession: ', data)
        let s = data.session;
        let currentEvent
        if (data.originator === 'remote') {
            //来电处理
            //console.info('>>>>>>>>>>>>>>>>>>>>来电>>>>>>>>>>>>>>>>>>>>')
            incomingSession = data.session
            currentSession = incomingSession
            direction = 'inbound'
            otherLegNumber = s.remote_identity.display_name
            currentEvent = INCOMING_CALL


        } else {
            //console.info('<<<<<<<<<<<<<<<<<<<<外呼<<<<<<<<<<<<<<<<<<<<')
            direction = 'outbound'
            currentEvent = OUTGOING_CALL
        }

        s.on('progress', (evt) => {
            //console.info('通话振铃-->通话振铃')
            onChangeState(currentEvent, {direction: direction, otherLegNumber: otherLegNumber, callId: currentCallId})
        });

        s.on('accepted', (evt) => {
            //console.info('通话中-->通话中')
            onChangeState(IN_CALL)
        });

        s.on('ended', (evt) => {
            //console.info('通话结束-->通话结束')
            cleanGlobalCallData()
            onChangeState(CALL_END)
        });

        s.on('failed', (evt) => {
            //console.info('通话失败-->通话失败')
            cleanGlobalCallData()
            onChangeState(CALL_END)
        })

        s.on('hold', (evt) => {
            //console.info('通话保持-->通话保持')
            onChangeState(HOLD)
        });


        s.on('unhold', (evt) => {
            //console.info('通话恢复-->通话恢复')
            onChangeState(IN_CALL)
        })

        s.on('peerconnection', (evt) => {
            //console.info('onPeerconnection - ', data.peerconnection);
            //处理通话中媒体流
            handleAudio(evt.peerconnection)
        });

        //防止检测时间过长
        let iceCandidateTimeout = null;
        s.on('icecandidate', (evt) => {
            if(iceCandidateTimeout != null){
                clearTimeout(iceCandidateTimeout);
            }

            if (evt.candidate.type === "srflx" || evt.candidate.type==="relay"){
                evt.ready();
            }

            iceCandidateTimeout = setTimeout(evt.ready,1000);
        })

    })

    //启动UA
    ua.start()
}

//注册请求
const register = () => {
    if (ua.isConnected) {
        ua.register()
    } else {
        let msg = 'websocket尚未连接，请先连接ws服务器.'
        console.error(msg)
        onChangeState(ERROR, {msg: msg})
    }
}

//取消注册
const unregister = () => {
    if (ua && ua.isConnected && ua.isRegistered()) {
        ua.unregister({all: true});
    } else {
        let msg = '尚未注册，操作禁止.'
        console.error(msg)
        onChangeState(ERROR, {msg: msg})
    }

}

//清理sdk初始化内容
const cleanSDK = () => {
    //清理sdk
    autoRegister = false
    outgoingSession = null
    incomingSession = null
    currentSession = null
    ua.stop()
}

//发起呼叫
const makecall = (phone) => {
    //注册情况下发起呼叫
    currentCallId = newUUID();
    if (ua && ua.isRegistered()) {
        outgoingSession = ua.call(phone, {
            eventHandlers: eventHandlers,
            mediaConstraints: constraints,
            mediaStream: localStream,
            extraHeaders: ["X-JCallId: " + currentCallId],
            sessionTimersExpires: 120,
            pcConfig: {
                iceTransportPolicy:"relay",
                iceServers: [
                    {urls: ['turn:139.155.11.48:3478'],
                        username: 'xsdhy',
                        credential: '123456',
                        credentialType: 'password'},
                ]
            }
        })
        //设置当前通话的session
        currentSession = outgoingSession
        otherLegNumber = phone
    } else {
        let msg = '请在注册成功后再发起外呼请求.'
        console.error(msg)
        onChangeState(ERROR, {msg: msg})
    }

}

//应答
const answer = () => {
    if (currentSession && currentSession.isInProgress()) {
        currentSession.answer({
            mediaConstraints: constraints,
            pcConfig: {
                iceTransportPolicy: "relay",
                iceServers: [
                    {urls: ['turn:139.155.11.48:3478'],
                        username: 'xsdhy',
                        credential: '123456',
                        credentialType: 'password'},
                ]
            }
        })
    } else {
        let msg = '非法操作，通话尚未建立或状态不正确，请勿操作.'
        onChangeState(ERROR, {msg: msg})
    }

}

//挂断电话
const hangup = () => {
    if (currentSession && !currentSession.isEnded()) {
        currentSession.terminate();
    } else {
        let msg = '当前通话不存在，无法执行挂断操作。'
        console.log(msg)
        onChangeState(ERROR, {msg: msg})
    }
}

//保持通话
const hold = () => {
    if (!checkCurrentCallIsActive()) {
        return
    }
    currentSession.hold();
}

//取消保持
const unhold = () => {
    if (!checkCurrentCallIsActive()) {
        return
    }
    if (!currentSession.isOnHold()) {

        return
    }
    currentSession.unhold();
}

//静音
const mute = () => {
    if (!checkCurrentCallIsActive()) {
        return
    }
    currentSession.mute();

}

//取消静音
const unmute = () => {
    if (!checkCurrentCallIsActive()) {
        return
    }
    currentSession.unmute();

}

// 转接
const transfer = (phone) => {
    if (!checkCurrentCallIsActive()) {
        return
    }
    currentSession.refer(phone)
}


//麦克风检测
const micCheck = () => {
    navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
    }).then(_ => {
        _.getTracks().forEach(track => {
            track.stop()
        })
    }).catch(_ => {
        console.error("麦克风检测异常！！请检查麦克风")
        onChangeState(MICERROR, {msg: "麦克风检测异常！！请检查麦克风"})
    })
}

//导出对外暴露的方法
module.exports = {
    initSDK,
    cleanSDK,
    register,
    unregister,
    makecall,
    hangup,
    answer,
    hold,
    unhold,
    transfer
}
