import * as jssip from "jssip";
import {v4 as uuidv4} from 'uuid';
import {
    EndEvent,
    HoldEvent,
    IceCandidateEvent,
    IncomingEvent, OutgoingEvent,
    PeerConnectionEvent,
    RTCSession
} from "jssip/lib/RTCSession";
import {IncomingRTCSessionEvent, OutgoingRTCSessionEvent} from "jssip/lib/UA";


//初始化配置
interface InitConfig {
    host: string,
    port: string,
    domain?: string,
    proto: true,
    extNo: string,
    extPwd: string,
    checkMic: boolean,
    stun?: StunConfig,
    autoRegister: boolean,
    debug?: boolean,
    stateEventListener: Function
}

interface StunConfig {
    type: StunType,
    host: string,
    username: string,
    password: string
}

type StunType = "turn" | "stun"

//呼叫方向:outbound呼出;inbound:呼入
type CallDirection = "outbound" | "inbound"

interface RTCIceServer {
    credential?: string;
    credentialType?: RTCIceCredentialType;
    urls: string | string[];
    username?: string;
}

const enum State {
    MIC_ERROR = "MICERROR",//麦克风检测异常
    ERROR = "ERROR",//错误操作或非法操作
    CONNECTED = "CONNECTED", //websocket已连接
    DISCONNECTED = "DISCONNECTED", //websocket已断开连接
    REGISTERED = "REGISTERED",//已注册
    UNREGISTERED = "UNREGISTERED", //取消注册
    REGISTER_FAILED = "REGISTER_FAILED",//注册失败
    INCOMING_CALL = "INCOMING_CALL",//呼入振铃
    OUTGOING_CALL = "OUTGOING_CALL", //外呼中
    IN_CALL = "IN_CALL",//通话中
    HOLD = "HOLD", //保持中
    CALL_END = "CALL_END", //通话结束
}


export default class cti {

    //媒体控制
    private static constraints = {
        audio: true,
        video: false
    }

    //本地媒体流
    //private static localStream;

    //创建audio控件并且自动播放
    private static audioView = document.createElement('audio')
    //audioView.autoplay = true;


    //jssip.UA
    //jssip.WebSocket
    private static ua: jssip.UA
    private static socket: jssip.WebSocketInterface
    //登录后是否自动注册
    private static autoRegister = false;
    //设置是否开启麦克风检测
    private static checkMic = false;

    //呼叫中session管理
    private static outgoingSession: RTCSession | undefined;
    private static incomingSession: RTCSession | undefined;
    private static currentSession: RTCSession | undefined;

    //呼叫方向 outbound:呼出/inbound:呼入
    private static direction: CallDirection
    //当前坐席号码
    private static localAgent: String
    //对方号码
    private static otherLegNumber: String
    //当前通话uuid
    private static currentCallId: String;

    private static reRegisterTimeInter: NodeJS.Timeout | undefined;

    //注册状态回调函数
    private static stateEventListener: Function;


    private static ice: RTCIceServer = {
        urls: ""
    }


    private static eventHandlers = {
        //回铃音处理
        peerconnection: (e: PeerConnectionEvent) => {
            this.handleAudio(e.peerconnection)
        }
    };

    //处理音频播放
    private static handleAudio(pc: RTCPeerConnection) {
        this.audioView.autoplay = true;
        console.log("这里是，回铃音处理")
        // pc.onaddstream = (media) => {
        //     let remoteStream = media.stream;
        //     if (remoteStream.active) {
        //         this.audioView.srcObject = remoteStream;
        //     }
        // }
    }

    //清理全局变量
    private static cleanGlobalCallData() {
        this.outgoingSession = undefined
        this.incomingSession = undefined
        this.currentSession = undefined
        // this.direction = ""
        this.otherLegNumber = ""
        this.currentCallId = ""
    }

    private static onChangeState(event: String, data: { msg?: string; localAgent?: String; direction?: CallDirection; otherLegNumber?: any; callId?: String; } | null) {
        this.stateEventListener(event, data)
    }

    //check当前通话是否存在
    private static checkCurrentCallIsActive(): boolean {
        if (!this.currentSession || !this.currentSession.isEstablished()) {
            let msg = '当前通话不存在或已销毁，无法执行该操作。'
            this.onChangeState(State.ERROR, {msg: msg})
            return false
        }
        return true
    }

    //初始化SDK
    public static initSDK(config: InitConfig) {
        //初始化变量

        //注入是否自动注册
        this.autoRegister = config.autoRegister
        //坐席号码
        this.localAgent = config.extNo


        if (undefined === config.domain || config.domain.length <= 0) {
            config.domain = config.host;
        }

        if (config.stun && config.stun.type && config.stun.host) {
            this.ice.urls = [config.stun.type + ':' + config.stun.host]
            if ("turn" === config.stun.type) {
                this.ice.username = config.stun.username
                this.ice.credential = config.stun.password
                this.ice.credentialType = "password"
            }
        } else {
            this.ice.urls = ['stun:stun.xsdhy.com:3478']
        }


        //注入状态回调函数
        if (config.stateEventListener !== null) {
            this.stateEventListener = config.stateEventListener
        }

        //麦克风检测开启
        if (config.checkMic) {
            this.checkMic = config.checkMic
            //执行麦克风检测报错
            this.micCheck()
        }


        if (config.debug) {
            jssip.debug.enable('JsSIP:*');
        } else {
            jssip.debug.disable()
        }

        // JsSIP.C.SESSION_EXPIRES=120,JsSIP.C.MIN_SESSION_EXPIRES=120;
        let proto = config.proto ? 'wss' : 'ws'
        let wsServer = proto + '://' + config.host + ':' + config.port
        let uri = 'sip:' + config.extNo + '@' + config.domain
        this.socket = new jssip.WebSocketInterface(wsServer)
        this.ua = new jssip.UA({
            sockets: [this.socket],
            uri: uri,
            password: config.extPwd,
            register: false,
            register_expires: 300,
            session_timers: false,
            // connection_recovery_max_interval:30,
            // connection_recovery_min_interval:4,
            user_agent: 'JsSIP'
        })

        //websocket连接成功
        this.ua.on('connected', (e) => {
            this.onChangeState(State.CONNECTED, {localAgent: this.localAgent})
            //自动注册
            if (this.autoRegister) {
                this.ua.register();
            }
        })
        //websocket连接失败
        this.ua.on('disconnected', (e) => {
            //ua.stop()
            this.onChangeState(State.DISCONNECTED, null)
        })
        //注册成功
        this.ua.on('registered', (e) => {
            //sip注册心跳机制
            if (this.reRegisterTimeInter) {
                clearInterval(this.reRegisterTimeInter);
            }
            setInterval(this.reRegister, 50 * 1000)
            this.onChangeState(State.REGISTERED, null)
        })
        //取消注册
        this.ua.on('unregistered', (e) => {
            console.log("unregistered:", e)
            if (this.reRegisterTimeInter) {
                clearInterval(this.reRegisterTimeInter);
            }
            this.onChangeState(State.UNREGISTERED, null)
        })
        //注册失败
        this.ua.on('registrationFailed', (e) => {
            console.error("registrationFailed", e)
            if (this.reRegisterTimeInter) {
                clearInterval(this.reRegisterTimeInter);
            }
            let msg = '注册失败,请检查账号密码是否正确。' + e.cause
            this.onChangeState(State.REGISTER_FAILED, {msg: msg})
        })
        //Fired a few seconds before the registration expires. If the application does not set any listener for this event,
        // JsSIP will just re-register as usual.
        this.ua.on('registrationExpiring', (e) => {
            console.error("registrationExpiring", e)
            this.ua.register()
        })

        //电话事件监听
        this.ua.on('newRTCSession', (data: IncomingRTCSessionEvent | OutgoingRTCSessionEvent) => {
            console.info('on new rtcsession: ', data)
            let s = data.session;
            let currentEvent: String
            if (data.originator === 'remote') {
                //来电处理
                //console.info('>>>>>>>>>>>>>>>>>>>>来电>>>>>>>>>>>>>>>>>>>>')
                this.incomingSession = data.session
                this.currentSession = this.incomingSession
                this.direction = 'inbound'
                currentEvent = State.INCOMING_CALL
            } else {
                //console.info('<<<<<<<<<<<<<<<<<<<<外呼<<<<<<<<<<<<<<<<<<<<')
                this.direction = 'outbound'
                currentEvent = State.OUTGOING_CALL
            }

            s.on('progress', (evt: IncomingEvent | OutgoingEvent) => {
                //console.info('通话振铃-->通话振铃')
                //s.remote_identity.display_name
                this.onChangeState(currentEvent, {
                    direction: this.direction,
                    otherLegNumber: data.request.from.uri.user,
                    callId: this.currentCallId
                })
            });

            s.on('accepted', (evt: IncomingEvent | OutgoingEvent) => {
                //console.info('通话中-->通话中')
                this.onChangeState(State.IN_CALL, null)
            });

            s.on('ended', (evt: EndEvent) => {
                //console.info('通话结束-->通话结束')
                this.cleanGlobalCallData()
                this.onChangeState(State.CALL_END, null)
            });

            s.on('failed', (evt: EndEvent) => {
                //console.info('通话失败-->通话失败')
                this.cleanGlobalCallData()
                this.onChangeState(State.CALL_END, null)
            })

            s.on('hold', (evt: HoldEvent) => {
                //console.info('通话保持-->通话保持')
                this.onChangeState(State.HOLD, null)
            });


            s.on('unhold', (evt: HoldEvent) => {
                //console.info('通话恢复-->通话恢复')
                this.onChangeState(State.IN_CALL, null)
            })

            s.on('peerconnection', (evt: PeerConnectionEvent) => {
                //console.info('onPeerconnection - ', data.peerconnection);
                //处理通话中媒体流
                this.handleAudio(evt.peerconnection)
            });

            //防止检测时间过长
            let iceCandidateTimeout: NodeJS.Timeout;
            s.on('icecandidate', (evt: IceCandidateEvent) => {
                if (iceCandidateTimeout != null) {
                    clearTimeout(iceCandidateTimeout);
                }
                if (evt.candidate.type === "srflx" || evt.candidate.type === "relay") {
                    evt.ready();
                }
                iceCandidateTimeout = setTimeout(evt.ready, 1000);
            })
        })

        //启动UA
        this.ua.start()
    }

    //重新注册
    private static reRegister() {
        if (this.ua.isConnected()) {
            this.ua.register()
        }
    }

    //注册请求
    public static register() {
        if (this.ua.isConnected()) {
            this.ua.register()
        } else {
            let msg = 'websocket尚未连接，请先连接ws服务器.'
            console.error(msg)
            this.onChangeState(State.ERROR, {msg: msg})
        }
    }

    //取消注册
    public static unregister() {
        if (this.ua && this.ua.isConnected() && this.ua.isRegistered()) {
            if (this.reRegisterTimeInter) {
                clearInterval(this.reRegisterTimeInter);
            }
            this.ua.unregister({all: true});
        } else {
            let msg = '尚未注册，操作禁止.'
            console.error(msg)
            this.onChangeState(State.ERROR, {msg: msg})
        }
    }

    //清理sdk初始化内容
    private static cleanSDK() {
        //清理sdk
        this.autoRegister = false
        this.outgoingSession = undefined
        this.incomingSession = undefined
        this.currentSession = undefined
        this.ua.stop()
    }


    //发起呼叫
    public static call = (phone: string, outNumber: String = ""): String => {
        //注册情况下发起呼叫
        this.currentCallId = uuidv4();
        if (this.ua && this.ua.isRegistered()) {
            this.outgoingSession = this.ua.call(phone, {
                eventHandlers: this.eventHandlers,
                mediaConstraints: this.constraints,
                //mediaStream: this.localStream,
                extraHeaders: ["X-JCallId: " + this.currentCallId, "X-JOutNumber: " + outNumber],
                sessionTimersExpires: 120,
                pcConfig: {
                    iceTransportPolicy: this.ice.username ? "relay" : "all",
                    iceServers: [this.ice]
                }
            })
            //设置当前通话的session
            this.currentSession = this.outgoingSession
            this.otherLegNumber = phone
            return this.currentCallId;
        } else {
            let msg = '请在注册成功后再发起外呼请求.'
            console.error(msg)
            this.onChangeState(State.ERROR, {msg: msg})
            return "";
        }
    }

    //应答
    public static answer() {
        if (this.currentSession && this.currentSession.isInProgress()) {
            this.currentSession.answer({
                mediaConstraints: this.constraints,
                pcConfig: {
                    iceTransportPolicy: this.ice.username ? "relay" : "all",
                    iceServers: [this.ice]
                }
            })
        } else {
            let msg = '非法操作，通话尚未建立或状态不正确，请勿操作.'
            this.onChangeState(State.ERROR, {msg: msg})
        }
    }

    //挂断电话
    public static hangup() {
        if (this.currentSession && !this.currentSession.isEnded()) {
            this.currentSession.terminate();
        } else {
            let msg = '当前通话不存在，无法执行挂断操作。'
            console.log(msg)
            this.onChangeState(State.ERROR, {msg: msg})
        }
    }

    //保持通话
    public static hold() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.hold();
    }

    //取消保持
    public static unhold() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        if (!this.currentSession.isOnHold()) {
            return
        }
        this.currentSession.unhold();
    }

    //静音
    public static mute() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.mute();
    }

    //取消静音
    public static unmute() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.unmute();
    }

    //转接
    public static transfer(phone: string) {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.refer(phone)
    }

    //发送按键
    public static sendDtmf(tone: string) {
        if (this.currentSession) {
            this.currentSession.sendDTMF(tone, {'duration': 160, 'interToneGap': 1200, 'extraHeaders': []})
        }
    }

    //麦克风检测
    public static micCheck() {
        navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
        }).then(_ => {
            _.getTracks().forEach(track => {
                track.stop()
            })
        }).catch(_ => {
            console.error("麦克风检测异常！！请检查麦克风")
            this.onChangeState(State.MIC_ERROR, {msg: "麦克风检测异常！！请检查麦克风"})
        })
    }
}


