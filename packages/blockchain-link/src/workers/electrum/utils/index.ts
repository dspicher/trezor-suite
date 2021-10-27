import type { Response } from '../../../types';
import type WorkerCommon from '../../common';
import type { ElectrumAPI } from '../api';

export * from './addressManager';
export * from './derivation';
export * from './discovery';
export * from './transform';
export * from './transaction';
export * from './misc';

export type Api<M, R extends Omit<Response, 'id'>> = M extends { payload: any }
    ? (client: ElectrumAPI, params: M['payload'], common: WorkerCommon) => Promise<R['payload']>
    : (client: ElectrumAPI, common: WorkerCommon) => Promise<R['payload']>;
