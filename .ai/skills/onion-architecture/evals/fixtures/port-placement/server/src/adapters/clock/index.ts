export interface Clock {
  now(): Date
  todayUtc(): string
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }

  todayUtc(): string {
    return this.now().toISOString().slice(0, 10)
  }
}
