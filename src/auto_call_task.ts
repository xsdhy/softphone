import SipCall from "./sipcall";


interface TaskItem {
    phone: string;
    id: string;
}

interface TaskStat {
    status: TaskStatus;//任务当前状态
    total: number;//任务总数
    called: number;//拨出数量
    answered: number;//已接听数量
    unAnswered: number;//未接听数量
    currentTask: TaskItem | undefined; //当前播打任务
    startTime: number | null; // 任务开始时间戳
    duration: number; // 任务持续时间（秒）
    runInfo: string; // 任务运行信息
}

enum TaskStatus {
    pause = "pause",
    running = "running",
    end = "end"
}

enum TaskCallbackType {
    TaskStat ="task_stat",//统计信息
    TaskEnd = "task_end",//任务结束
    TaskPause = "task_pause",//任务暂停,回调时传入暂停原因
    CallAnswer = "call_answer",//接听:这时候可以弹出客户详情页
    CallEnd = "call_end",//结束:这时候可以弹出登记结束状态码页面
}

interface TaskPauseInfo {
    source: string;//暂停来源:system系统,user用户
    reason: string;//暂停原因
}

type TaskCallbackEvent = {
    type: TaskCallbackType;
    data: TaskStat | TaskItem | undefined;
};

type TaskConfig = {
    AutoAfterCallWork: boolean; // 自动拨打电话后是否自动整理
}

export class AutoCallTask {
    private sipClient: SipCall;
    private config: TaskConfig;
    private taskCallback: (type: TaskCallbackType, data: any) => void;


    private taskStatus: TaskStatus = TaskStatus.pause;// 任务状态：pause暂停，running进行中，end结束

    //当前正在播打的任务
    private currentTask: TaskItem | undefined;

    private statusOnline: boolean = false;// 坐席在线
    private statusReady: boolean = false;// 空闲
    private statusRing: boolean = false;// 振铃中
    private statusCalling: boolean = false;// 呼叫中
    private statusOrganizing: boolean = false;//整理中

    // 任务统计数据
    private taskStat: TaskStat = {
        status: TaskStatus.pause,
        total: 0,
        called: 0,
        answered: 0,
        unAnswered: 0,
        currentTask: undefined,
        startTime: null,
        duration: 0,
        runInfo: ""
    };

    // 定时器
    private statTimer: NodeJS.Timeout | null = null;

    private taskList: TaskItem[] = [];

    constructor(sipClient: SipCall,config:TaskConfig, taskCallback: (type: TaskCallbackType, data: any) => void) {
        this.sipClient = sipClient;
        this.config = config;
        this.taskCallback = taskCallback;
        this.initEventListeners();
    }

    // 分离事件监听逻辑，使代码更清晰
    private initEventListeners(): void {
        this.sipClient.on('event', (event: string, data: any) => {
            console.log("收到事件:", event, data);
            switch (event) {
                case "DISCONNECTED":
                    this.handleDisconnected();
                    break;
                case "REGISTERED":
                    this.handleRegistered();
                    break;
                case "UNREGISTERED":
                    this.handleUnregistered();
                    break;
                case "CONNECTED":
                    //已连接
                    break;
                case "DISCONNECT":
                    console.log("DISCONNECT", data.msg);
                    break;
                case "RECONNECT":
                    break;
                case "REGISTER_FAILED":
                    break;
                case "INCOMING_CALL":
                    this.handleIncomingCall();
                    break;
                case "OUTGOING_CALL":
                    this.handleOutgoingCall();
                    break;
                case "IN_CALL":
                    this.handleInCall();
                    break;
                case "CALL_END":
                    this.handleCallEnd(data);
                    break;
                default:
                    break;
            }
        });
    }

    // 事件处理方法
    private handleDisconnected(): void {
        // 处理断开连接
        this.pauseTask({source: "system", reason: "disconnected"});
    }

    private handleRegistered(): void {
        this.statusOnline = true;
    }

    private handleUnregistered(): void {
        this.statusOnline = false;
        this.statusReady = false;
        this.statusRing = false;
        this.statusCalling = false;
        this.pauseTask({source: "system", reason: "unregistered"});
    }

    private handleIncomingCall(): void {
        this.statusRing = true;
    }

    private handleOutgoingCall(): void {
        this.statusRing = true;
    }

    private handleInCall(): void {
        this.taskCallback(TaskCallbackType.CallAnswer, this.currentTask);
        this.statusRing = false;
        this.statusCalling = true;
        this.taskStat.answered++;
        this.updateTaskStat();
    }

    private handleCallEnd(data: any): void {
        this.statusRing = false;
        this.statusCalling = false;
        
        if (!data.answered) {
            this.taskStat.unAnswered++;
            this.updateTaskStat();
            this.next();
            return;
        }
        
        this.taskCallback(TaskCallbackType.CallEnd, this.currentTask);
        this.currentTask = undefined;
        this.updateTaskStat();
        if (!this.config.AutoAfterCallWork) {
            this.next();
        }
    }

    // 更新任务统计并发送回调
    private updateTaskStat(): void {
        this.taskStat.status = this.taskStatus;
        this.taskStat.currentTask = this.currentTask;
        
        // 计算任务持续时间
        if (this.taskStat.startTime !== null) {
            this.taskStat.duration = Math.floor((Date.now() - this.taskStat.startTime) / 1000);
        }
        
        this.taskCallback(TaskCallbackType.TaskStat, this.taskStat);
    }

    // 启动定时器，每秒回调一次任务状态
    private startStatTimer(): void {
        // 停止已存在的定时器
        this.stopStatTimer();
        
        // 创建新的定时器
        this.statTimer = setInterval(() => {
            if (this.taskStatus === TaskStatus.running) {
                this.updateTaskStat();
            }
        }, 1000);
    }

    // 停止定时器
    private stopStatTimer(): void {
        if (this.statTimer) {
            clearInterval(this.statTimer);
            this.statTimer = null;
        }
    }

    // 设置任务状态并更新统计数据
    private setTaskStatus(status: TaskStatus): void {
        this.taskStatus = status;
        this.taskStat.status = status;
    }

    public addTask(task: TaskItem): void {
        this.taskList.push(task);
        this.taskStat.total++;
        this.updateTaskStat();
    }

    public addTasks(tasks: TaskItem[]): void {
        if (tasks.length === 0) return;
        
        this.taskList.push(...tasks);
        this.taskStat.total += tasks.length;
        this.updateTaskStat();
    }

    public start(): void {
        // 设置任务状态为运行中
        this.setTaskStatus(TaskStatus.running);
        
        // 记录开始时间
        this.taskStat.startTime = Date.now();
        this.taskStat.duration = 0;
        
        // 启动定时器
        this.startStatTimer();
        
        // 立即发送一次状态更新
        this.updateTaskStat();
        
        // 拨打任务列表中的第一个任务
        this.next();
    }

    public next(): void {
        if (this.taskStatus !== TaskStatus.running) {
            return;
        }
        
        this.currentTask = this.taskList.shift();
        
        if (this.currentTask) {
            this.sipClient.call(this.currentTask.phone);
            this.taskStat.called++;
            this.updateTaskStat();
        } else {
            // 任务列表为空，任务结束
            this.endTask();
        }
    }

    // 结束任务
    private endTask(): void {
        this.setTaskStatus(TaskStatus.end);
        this.stopStatTimer();
        this.updateTaskStat();
        this.taskCallback(TaskCallbackType.TaskEnd, this.taskStat);
    }

    private pauseTask(pauseInfo: TaskPauseInfo): void {
        this.setTaskStatus(TaskStatus.pause);
        this.stopStatTimer();
        this.updateTaskStat();
        this.taskCallback(TaskCallbackType.TaskPause, pauseInfo);
    }

    public pause(): void {
        this.pauseTask({source: "user", reason: ""});
    }

    public stop(): void {
        this.endTask();
    }

    // 销毁方法，清理资源
    public destroy(): void {
        this.stopStatTimer();
        this.currentTask = undefined;
        this.taskList = [];
    }
}