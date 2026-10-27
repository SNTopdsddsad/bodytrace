export type TrainingClockReading = { date: string; time: string; iso: string };

/**
 * 以服务端样本为基准，只累计单调时钟的经过时间，不受设备系统时间快慢或调整影响。
 * 样本到达浏览器后的网络耗时不向前补偿，避免把开始时刻估算到服务端的未来。
 * 开始记录和保存前重新采样，避免预取、后台停留或设备休眠留下过旧的基准。
 */
export function createTrainingClock(serverNow: string, monotonicNow = () => performance.now()) {
  const parseSample = (value: string) => {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) throw new Error("无法读取服务器时间，请重试");
    return milliseconds;
  };
  let sampledTime = parseSample(serverNow);
  let sampledTick = monotonicNow();

  return {
    synchronize(value: string) {
      sampledTime = parseSample(value);
      sampledTick = monotonicNow();
    },
    read(timeZone: string): TrainingClockReading {
      const elapsed = Math.max(0, monotonicNow() - sampledTick);
      const now = new Date(sampledTime + elapsed);
      return {
        date: new Intl.DateTimeFormat("en-CA", { timeZone }).format(now),
        time: new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now),
        iso: now.toISOString(),
      };
    },
  };
}
