import { PositionStore } from '../core/state/positionStore';
import { TradeLogger } from '../core/logger/tradeLogger';
import { Config } from '../config/config';

export interface StrategyInstanceConfig {
  instanceId: string;              // 唯一标识，如 "BTCUSDT_TREND_V1"
  strategyName: string;             // 策略名称，如 "trendStrategy"
  symbol: string;                   // 交易对，如 "BTCUSDT"
  config: Config;                   // 完整配置（包含所有参数）
}

export class StrategyInstance {
  readonly instanceId: string;
  readonly strategyName: string;
  readonly symbol: string;
  readonly config: Config;
  
  private positionStore: PositionStore;
  private logger: TradeLogger;
  
  constructor(config: StrategyInstanceConfig) {
    this.instanceId = config.instanceId;
    this.strategyName = config.strategyName;
    this.symbol = config.symbol;
    this.config = config.config;
    
    // 每个实例拥有独立的状态组件
    this.positionStore = new PositionStore();
    this.logger = new TradeLogger();
    this.logger.setInitialCapital(config.config.backtest.initialCapital);
  }
  
  getPositionStore(): PositionStore {
    return this.positionStore;
  }
  
  getLogger(): TradeLogger {
    return this.logger;
  }
}
