declare module 'pg' {
	export type QueryResult<T = any> = {
		rows: T[];
		rowCount: number;
	};

	export interface PoolClient {
		query<T = any>(...args: any[]): Promise<QueryResult<T>>;
		release(): void;
	}

	export class Pool {
		constructor(...args: any[]);
		query<T = any>(...args: any[]): Promise<QueryResult<T>>;
		connect(): Promise<PoolClient>;
	}

	export const types: any;
}
