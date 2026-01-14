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
        isTrailingActive?: boolean;
        maxUnrealizedR?: number;
        trailingMode?: "EMA20" | "EMA50"; // v5: Trailing stop mode
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
          initialStopLoss: action.payload.stopLoss, // Store initial stop loss
          stopLoss: action.payload.stopLoss, // Current stop loss (initially = initialStopLoss)
          trailingStop: undefined,
          size: action.payload.size,
          entryTime: action.payload.entryTime,
          isTrailingActive: false,
          maxUnrealizedR: 0,
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
        }

        // Update trailing stop state fields
        if (action.payload.isTrailingActive !== undefined) {
          this.position.isTrailingActive = action.payload.isTrailingActive;
        }

        if (action.payload.maxUnrealizedR !== undefined) {
          this.position.maxUnrealizedR = action.payload.maxUnrealizedR;
        }

        // v5: Update trailing mode
        if (action.payload.trailingMode !== undefined) {
          this.position.trailingMode = action.payload.trailingMode;
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
