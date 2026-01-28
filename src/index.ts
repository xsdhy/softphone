import SipCall from './sipcall';
import { AutoCallTask } from './auto_call_task';

// 将 AutoCallTask 挂载为 SipCall 的静态属性
// 使用方式：new SipCall.AutoCallTask(sipClient, config, callback)
(SipCall as any).AutoCallTask = AutoCallTask;

// 只使用默认导出，确保 UMD 模式下 window.SipCall 直接是 SipCall 类
// 这样原有的 new SipCall(...) 和 SipCall.getMediaDeviceInfo() 继续正常工作
export default SipCall; 