import { Position, TradeReason, PositionSide, PositionState } from '../types';

type PositionAction =
  | {
      type: 'OPEN_POSITION';
      payload: {
        side: PositionSide;
        entryPrice: number;
        stopLoss: number;
        size: number;
        entryTime: number;
      };
      reason: TradeReason;
    }
  | {
      type: 'UPDATE_STOP';
      payload: {
        stopLoss?: number;
        trailingStop?: number;
      };
      reason: TradeReason;
    }
  | {
      type: 'CLOSE_POSITION';
      payload: {
        exitPrice: number;
        exitTime: number;
      };
      reason: TradeReason;
    }
  | {
      type: 'START_CLOSING';
    };

/**
 * Position Store with FSM (FLAT / OPEN / CLOSING)
 */
export class PositionStore {
  private position: Position | null = null;
  private state: PositionState = "FLAT";

  /**
   * Get current position
   */
  get(): Position | null {
    return this.position;
  }

  /**
   * Get current position state
   */
  getState(): PositionState {
    return this.state;
  }

  /**
   * Dispatch action to update position state
   */
  dispatch(action: PositionAction) {
    switch (action.type) {
      case 'OPEN_POSITION': {
        if (this.position || this.state !== "FLAT") {
          throw new Error('Position already exists or state is not FLAT');
        }

        this.position = {
          side: action.payload.side,
          entryPrice: action.payload.entryPrice,
          stopLoss: action.payload.stopLoss,
          trailingStop: undefined,
          size: action.payload.size,
          entryTime: action.payload.entryTime,
          reason: action.reason,
        };
        this.state = "OPEN";
        break;
      }

      case 'UPDATE_STOP': {
        if (!this.position || this.state !== "OPEN") return;

        if (action.payload.stopLoss !== undefined) {
          this.position.stopLoss = action.payload.stopLoss;
        }

        if (action.payload.trailingStop !== undefined) {
          this.position.trailingStop = action.payload.trailingStop;
          // trailing stop 一旦存在，成为新的"有效止损"
          this.position.stopLoss = action.payload.trailingStop;
        }
        break;
      }

      case 'START_CLOSING': {
        if (this.state === "OPEN") {
          this.state = "CLOSING";
        }
        break;
      }

      case 'CLOSE_POSITION': {
        if (!this.position) return;

        this.position = null;
        this.state = "FLAT";
        break;
      }

      default:
        throw new Error('Unknown position action');
    }
  }
}
