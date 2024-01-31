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
import {
    IncomingMessageEvent,
    IncomingRTCSessionEvent,
    OutgoingMessageEvent,
    OutgoingRTCSessionEvent
} from "jssip/lib/UA";
import {clearTimeout} from "timers";
import * as timers from "timers";


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

interface StateListenerMessage {
    msg?: string;
    localAgent?: String;
    direction?: CallDirection; //呼叫方向
    otherLegNumber?: String;
    callId?: String;

    latencyTime?: number | undefined //网络延迟(ms)
    upLossRate?: number | undefined //上行-丢包率
    downLossRate?: number | undefined //下行-丢包率
}

interface NetworkLatencyStat {
    roundTripTime: number | undefined //延迟时间(ms)


    inboundLost: number | undefined  //下行-丢包数量
    inboundPacketsSent: number | undefined //下行-包的总数

    outboundLost: number | undefined  //上行-丢包数量
    outboundPacketsSent: number | undefined //上行-包的总数
}

interface CallExtraParam {
    outNumber?: string;
    businessId?: String;
}

const enum State {
    MIC_ERROR = "MIC_ERROR",//麦克风检测异常
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
    MUTE = "MUTE", //静音
    UNMUTE = "UNMUTE", //取消静音
    LATENCY_STAT = "LATENCY_STAT", //网络延迟统计
}


export default class SipCall {
    //媒体控制
    private constraints = {
        audio: true,
        video: false
    }

    //创建audio控件，播放声音的地方
    private audioView = document.createElement('audio')


    private ua: jssip.UA
    private socket: jssip.WebSocketInterface
    private ice: RTCIceServer = {urls: ""}


    //当前坐席号码
    private localAgent: String
    //呼叫中session:呼出、呼入、当前
    private outgoingSession: RTCSession | undefined;
    private incomingSession: RTCSession | undefined;
    private currentSession: RTCSession | undefined;
    //呼叫方向 outbound:呼出/inbound:呼入
    private direction: CallDirection | undefined;
    //对方号码
    private otherLegNumber: String | undefined;
    //当前通话uuid
    private currentCallId: String | undefined;


    //当前通话的网络延迟统计定时器(每秒钟获取网络情况)
    private currentLatencyStatTimer: NodeJS.Timer | undefined;
    private currentStatReport: NetworkLatencyStat;

    //回调函数
    private stateEventListener: Function | undefined;


    //构造函数-初始化SDK
    constructor(config: InitConfig) {
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
            this.micCheck()
        }

        //开始jssip调试模式
        if (config.debug) {
            jssip.debug.enable('JsSIP:*');
        } else {
            jssip.debug.disable()
        }

        // JsSIP.C.SESSION_EXPIRES=120,JsSIP.C.MIN_SESSION_EXPIRES=120;
        let proto = config.proto ? 'wss' : 'ws'
        let wsServer = proto + '://' + config.host + ':' + config.port
        this.socket = new jssip.WebSocketInterface(wsServer)

        this.ua = new jssip.UA({
            sockets: [this.socket],
            uri: 'sip:' + config.extNo + '@' + config.domain,
            password: config.extPwd,
            register: false,
            register_expires: 15,
            session_timers: false,
            // connection_recovery_max_interval:30,
            // connection_recovery_min_interval:4,
            user_agent: 'JsSIP 3.9.0'
        })

        //websocket连接成功
        this.ua.on('connected', (e) => {
            this.onChangeState(State.CONNECTED, null)
            //自动注册
            if (config.autoRegister) {
                this.ua.register();
            }
        })
        //websocket连接失败
        this.ua.on('disconnected', (e) => {
            this.ua.stop()
            this.onChangeState(State.DISCONNECTED, null)
        })
        //注册成功
        this.ua.on('registered', (e) => {
            this.onChangeState(State.REGISTERED, {localAgent: this.localAgent})
        })
        //取消注册
        this.ua.on('unregistered', (e) => {
            // console.log("unregistered:", e);
            this.ua.stop();
            this.onChangeState(State.UNREGISTERED, {localAgent: this.localAgent})
        })
        //注册失败
        this.ua.on('registrationFailed', (e) => {
            // console.error("registrationFailed", e)
            this.onChangeState(State.REGISTER_FAILED, {msg: '注册失败:' + e.cause})
            this.ua.stop()
        })
        //Fired a few seconds before the registration expires
        this.ua.on('registrationExpiring', (e) => {
            // console.log("registrationExpiring")
            this.ua.register()
        })

        //电话事件监听
        this.ua.on('newRTCSession', (data: IncomingRTCSessionEvent | OutgoingRTCSessionEvent) => {
            // console.info('on new rtcsession: ', data)
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

            s.on('peerconnection', (evt: PeerConnectionEvent) => {
                // console.info('onPeerconnection');
                //处理通话中媒体流
                this.handleAudio(evt.peerconnection)
            });

            s.on('connecting', () => {
                // console.info('connecting')
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

            s.on('sending', () => {
                // console.info('sending')
            });

            s.on('progress', (evt: IncomingEvent | OutgoingEvent) => {
                // console.info('通话振铃-->通话振铃')
                //s.remote_identity.display_name
                this.onChangeState(currentEvent, {
                    direction: this.direction,
                    otherLegNumber: data.request.from.uri.user,
                    callId: this.currentCallId
                })
            });

            s.on('accepted', (evt: IncomingEvent | OutgoingEvent) => {
                // console.info('通话中-->通话中')
                this.onChangeState(State.IN_CALL, null)
            });
            s.on('accepted', () => {
                // console.info('accepted')
            });

            s.on('ended', (evt: EndEvent) => {
                // console.info('通话结束-->通话结束')
                this.cleanCallingData()
                this.onChangeState(State.CALL_END, null)
            });

            s.on('failed', (evt: EndEvent) => {
                // console.info('通话失败-->通话失败')
                this.cleanCallingData()
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
        })

        this.ua.on('newMessage', (data: IncomingMessageEvent | OutgoingMessageEvent) => {
            let s = data.message;
            s.on('succeeded', (evt) => {
                // console.log("newMessage-succeeded:", data, evt)
            })
            s.on('failed', (evt) => {
                // console.log("newMessage-succeeded:", data)
            })
        })


        //启动UA
        this.ua.start()
    }

    //处理音频播放
    private handleAudio(pc: RTCPeerConnection) {
        this.audioView.autoplay = true;

        //网络情况统计
        this.currentStatReport = {
            outboundPacketsSent: 0,
            outboundLost: 0,
            inboundLost: 0,
            inboundPacketsSent: 0
        }
        this.currentLatencyStatTimer = setInterval(() => {
            pc.getStats().then((stats) => {
                stats.forEach((report) => {
                    if (report.type=='media-source'){
                        // console.log("音量:",report.audioLevel)
                    }
                    if (report.type != 'remote-inbound-rtp' && report.type != 'inbound-rtp' && report.type != 'remote-outbound-rtp' && report.type != 'outbound-rtp') {
                        return
                    }
                    switch (report.type) {
                        case "outbound-rtp"://客户端发送的-上行
                            this.currentStatReport.outboundPacketsSent = report.packetsSent
                            break;
                        case "remote-inbound-rtp"://服务器收到的-对于客户端来说也就是上行
                            this.currentStatReport.outboundLost = report.packetsLost
                            //延时(只会在这里有这个)
                            this.currentStatReport.roundTripTime = report.roundTripTime
                            break;
                        case "inbound-rtp"://客户端收到的-下行
                            this.currentStatReport.inboundLost = report.packetsLost
                            break;
                        case "remote-outbound-rtp"://服务器发送的-对于客户端来说就是下行
                            this.currentStatReport.inboundPacketsSent = report.packetsSent
                            break
                    }
                });
                let inboundLossRate = 0//下行丢包率
                let outboundLossRate = 0//上行丢包率
                let roundTripTime = 0;//延迟

                if (this.currentStatReport.inboundLost && this.currentStatReport.inboundPacketsSent) {
                    inboundLossRate = this.currentStatReport.inboundLost / this.currentStatReport.inboundPacketsSent;
                }
                if (this.currentStatReport.outboundLost && this.currentStatReport.outboundPacketsSent) {
                    outboundLossRate = this.currentStatReport.outboundLost / this.currentStatReport.outboundPacketsSent;
                }
                if (this.currentStatReport.roundTripTime != undefined) {
                    roundTripTime = Math.floor(this.currentStatReport.roundTripTime * 1000)
                }
                console.debug(
                    '上行/下行(丢包率):' +
                    (outboundLossRate * 100).toFixed(2) + "% / " +
                    (inboundLossRate * 100).toFixed(2) + "%",
                    "延迟:" + roundTripTime.toFixed(2) + "ms"
                );
                this.onChangeState(State.LATENCY_STAT, {
                    latencyTime: roundTripTime,
                    upLossRate: outboundLossRate,
                    downLossRate: inboundLossRate,
                })
            })
        }, 1000);

        if ("addTrack" in pc) {
            pc.ontrack = (media) => {
                if (media.streams.length > 0 && media.streams[0].active) {
                    this.audioView.srcObject = media.streams[0];
                }
            }
        } else {
            //onaddstream方法被规范不建议使用
            pc.onaddstream = (media: {
                stream: any;
            }) => {
                let remoteStream = media.stream;
                if (remoteStream.active) {
                    this.audioView.srcObject = remoteStream;
                }
            }
        }
    }

    //清理一通通话的相关数据
    private cleanCallingData() {
        this.outgoingSession = undefined
        this.incomingSession = undefined
        this.currentSession = undefined
        this.direction = undefined
        this.otherLegNumber = ""
        this.currentCallId = ""


        clearInterval(this.currentLatencyStatTimer)
        this.currentLatencyStatTimer = undefined
        this.currentStatReport = {
            outboundPacketsSent: 0,
            outboundLost: 0,
            inboundLost: 0,
            inboundPacketsSent: 0
        }
    }

    private onChangeState(event: String, data: StateListenerMessage | null) {
        if (undefined === this.stateEventListener) {
            return
        }
        this.stateEventListener(event, data)
    }

    //check当前通话是否存在
    private checkCurrentCallIsActive(): boolean {
        if (!this.currentSession || !this.currentSession.isEstablished()) {
            this.onChangeState(State.ERROR, {msg: '当前通话不存在或已销毁，无法执行该操作。'})
            return false
        }
        return true
    }

    //注册请求
    public register() {
        if (this.ua.isConnected()) {
            this.ua.register()
        } else {
            this.onChangeState(State.ERROR, {msg: 'websocket尚未连接，请先连接ws服务器.'})
        }
    }

    //取消注册
    public unregister() {
        if (this.ua && this.ua.isConnected() && this.ua.isRegistered()) {
            this.ua.unregister({all: true});
        } else {
            this.onChangeState(State.ERROR, {msg: '尚未注册，操作禁止.'})
        }
    }

    //清理sdk初始化内容
    private cleanSDK() {
        //清理sdk
        this.cleanCallingData();
        this.ua.stop()
    }

    public sendMessage = (target: string, content: string) => {
        let options = {
            'contentType': 'text/plain'
        };
        this.ua.sendMessage(target, content, options);
    }

    //发起呼叫
    public call = (phone: string, param: CallExtraParam = {}): String => {
        this.micCheck();
        //注册情况下发起呼叫
        this.currentCallId = uuidv4();
        if (this.ua && this.ua.isRegistered()) {
            const extraHeaders: string[] = ["X-JCallId: " + this.currentCallId];
            if (param) {
                if (param.businessId) {
                    extraHeaders.push("X-JBusinessId: " + param.businessId)
                }
                if (param.outNumber) {
                    extraHeaders.push("X-JOutNumber: " + param.outNumber)
                }
            }
            this.outgoingSession = this.ua.call(phone, {
                eventHandlers: {
                    //回铃音处理
                    peerconnection: (e: {
                        peerconnection: RTCPeerConnection;
                    }) => {
                        this.handleAudio(e.peerconnection)
                    }
                },
                mediaConstraints: this.constraints,
                extraHeaders: extraHeaders,
                sessionTimersExpires: 120,
                pcConfig: {
                    iceTransportPolicy: "all",
                    iceServers: [this.ice]
                }
            })
            //设置当前通话的session
            this.currentSession = this.outgoingSession
            this.otherLegNumber = phone
            return this.currentCallId;
        } else {
            this.onChangeState(State.ERROR, {msg: '请在注册成功后再发起外呼请求.'})
            return "";
        }
    }

    //应答
    public answer() {
        if (this.currentSession && this.currentSession.isInProgress()) {
            this.currentSession.answer({
                mediaConstraints: this.constraints,
                pcConfig: {
                    iceTransportPolicy: "all",
                    iceServers: [this.ice]
                }
            })
        } else {
            this.onChangeState(State.ERROR, {msg: '非法操作，通话尚未建立或状态不正确，请勿操作.'})
        }
    }

    //挂断电话
    public hangup() {
        if (this.currentSession && !this.currentSession.isEnded()) {
            this.currentSession.terminate();
        } else {
            this.onChangeState(State.ERROR, {msg: '当前通话不存在，无法执行挂断操作。'})
        }
    }

    //保持通话
    public hold() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.hold();
    }

    //取消保持
    public unhold() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        if (!this.currentSession.isOnHold()) {
            return
        }
        this.currentSession.unhold();
    }

    //静音
    public mute() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.mute();
        this.onChangeState(State.MUTE, null)
    }

    //取消静音
    public unmute() {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.unmute();
        this.onChangeState(State.UNMUTE, null)
    }

    //转接
    public transfer(phone: string) {
        if (!this.currentSession || !this.checkCurrentCallIsActive()) {
            return
        }
        this.currentSession.refer(phone)
    }

    //发送按键
    public sendDtmf(tone: string) {
        if (this.currentSession) {
            this.currentSession.sendDTMF(tone, {'duration': 160, 'interToneGap': 1200, 'extraHeaders': []})
        }
    }

    //麦克风检测
    public micCheck() {
        navigator.permissions.query({ name: "microphone" }).then( (result)=> {
            if (result.state == "denied") {
                this.onChangeState(State.MIC_ERROR, {msg: "麦克风权限被禁用,请设置允许使用麦克风"});
                return;
            } else if (result.state == "prompt") {
                this.onChangeState(State.MIC_ERROR, {msg: "麦克风权限未开启,请设置允许使用麦克风权限后重试"});
            }
            //经过了上面的检测，这一步应该不需要了
            if (navigator.mediaDevices==undefined){
                this.onChangeState(State.MIC_ERROR, {msg: "麦克风检测异常,请检查麦克风权限是否开启,是否在HTTPS站点"})
                return
            }
            navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            }).then(_ => {
                _.getTracks().forEach(track => {
                    track.stop()
                })
            }).catch(_ => {
                this.onChangeState(State.MIC_ERROR, {msg: "麦克风检测异常,请检查麦克风是否插好"})
            })
        });
    }

    //麦克风测试
    public static async testMicrophone(handle: (arg0: number) => void) {
        try {
            let stream = await navigator.mediaDevices.getUserMedia({audio: true});
            let context = new AudioContext(); //音频内容
            let recorder = context.createScriptProcessor(4096, 1, 1);
            recorder.addEventListener("audioprocess", e => {
                let buffer = e.inputBuffer.getChannelData(0);
                let maxVal = 0;
                for (let i = 0; i < buffer.length; i++) {
                    if (maxVal < buffer[i]) {
                        maxVal = buffer[i];
                    }
                }
                // 模拟音量
                handle(Math.round(maxVal * 100));
            });
            let audioInput = context.createMediaStreamSource(stream);
            audioInput.connect(recorder);
            recorder.connect(context.destination);
            const stop = () => {
                audioInput.disconnect();
                recorder.disconnect();
                stream.getTracks()[0].stop();
            };
            return {
                yes: () => {
                    stop();
                }, no: () => {
                    stop();
                }
            };
        } catch (e) {
            return {
                yes: () => {
                },
                no: () => {
                },
            };
        }
    }

    //获取媒体设备
    public static async getMediaDeviceInfo() {
        if (navigator.mediaDevices==null){
            return [];
        }
        let deviceInfos = await navigator.mediaDevices.enumerateDevices();
        let devices: [] = [];
        for (let {kind, label, deviceId, groupId} of deviceInfos) {
            let kindText = "";
            switch (kind) {
                case "audioinput":
                    kindText = "输入";
                    break;
                case "audiooutput":
                    kindText = "输出";
                    break;
                default:
                    kindText = "未知";
            }
            devices.push({kind, label, deviceId, groupId, kindText})
        }
        return devices;
    }
}
