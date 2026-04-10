import { Pool } from 'pg';

/**
 * Chainable query builder that compiles to raw SQL.
 * Drop-in replacement for database's QueryBuilder pattern.
 *
 * Usage:
 *   const result = await db.table('users')
 *     .select('id, name, email')
 *     .where('is_active', '=', true)
 *     .orderBy('created_at', 'desc')
 *     .limit(10)
 *     .execute();
 */
export class QueryBuilder {
  private _table: string;
  private _pool: Pool;
  private _selectColumns: string = '*';
  private _whereClauses: string[] = [];
  private _whereValues: any[] = [];
  private _orderByClause: string = '';
  private _limitClause: string = '';
  private _offsetClause: string = '';
  private _operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private _insertData: Record<string, any> | null = null;
  private _updateData: Record<string, any> | null = null;
  private _returning: string = '';

  constructor(pool: Pool, tableName: string) {
    this._pool = pool;
    this._table = tableName;
  }

  select(...columns: string[]): this {
    if (columns.length === 0) {
      this._selectColumns = '*';
    } else if (columns.length === 1) {
      this._selectColumns = columns[0];
    } else {
      this._selectColumns = columns.join(', ');
    }
    this._operation = 'select';
    return this;
  }

  where(column: string, operatorOrValue: any, value?: any): this {
    // Support both: where('col', value) and where('col', '>=', value)
    let operator: string;
    let actualValue: any;
    if (arguments.length === 2) {
      operator = '=';
      actualValue = operatorOrValue;
    } else {
      operator = operatorOrValue;
      actualValue = value;
    }
    this._whereValues.push(actualValue);
    this._whereClauses.push(`"${column}" ${operator} $${this._whereValues.length}`);
    return this;
  }

  // Comparison aliases used by some callers
  gte(column: string, value: any): this { return this.where(column, '>=', value); }
  lte(column: string, value: any): this { return this.where(column, '<=', value); }
  gt(column: string, value: any): this { return this.where(column, '>', value); }
  lt(column: string, value: any): this { return this.where(column, '<', value); }
  eq(column: string, value: any): this { return this.where(column, '=', value); }
  neq(column: string, value: any): this { return this.where(column, '!=', value); }

  // Combined OR clause - accepts callbacks that build sub-clauses on a temp builder
  or(...callbacks: Array<(qb: QueryBuilder) => any>): this {
    const subClauses: string[] = [];
    for (const cb of callbacks) {
      const sub = new QueryBuilder(this._pool, this._table);
      // Share the parameter index with parent so placeholder numbers stay unique
      (sub as any)._whereValues = this._whereValues;
      cb(sub);
      if ((sub as any)._whereClauses.length > 0) {
        subClauses.push((sub as any)._whereClauses.join(' AND '));
      }
    }
    if (subClauses.length > 0) {
      this._whereClauses.push(`(${subClauses.join(' OR ')})`);
    }
    return this;
  }

  // Alias for whereIn
  in(column: string, values: any[]): this {
    return this.whereIn(column, values);
  }

  // Count rows matching current filters
  async count(): Promise<number> {
    const whereStr = this.buildWhereClause();
    const sql = `SELECT COUNT(*) as count FROM "${this._table}"${whereStr}`;
    const result = await this._pool.query(sql, this._whereValues);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  whereIn(column: string, values: any[]): this {
    const placeholders = values.map((_, i) => `$${this._whereValues.length + i + 1}`);
    this._whereValues.push(...values);
    this._whereClauses.push(`"${column}" IN (${placeholders.join(', ')})`);
    return this;
  }

  whereNotIn(column: string, values: any[]): this {
    const placeholders = values.map((_, i) => `$${this._whereValues.length + i + 1}`);
    this._whereValues.push(...values);
    this._whereClauses.push(`"${column}" NOT IN (${placeholders.join(', ')})`);
    return this;
  }

  isNull(column: string): this {
    this._whereClauses.push(`"${column}" IS NULL`);
    return this;
  }

  // Alias used by callers
  whereNull(column: string): this {
    return this.isNull(column);
  }

  whereNotNull(column: string): this {
    return this.isNotNull(column);
  }

  isNotNull(column: string): this {
    this._whereClauses.push(`"${column}" IS NOT NULL`);
    return this;
  }

  like(column: string, pattern: string): this {
    this._whereValues.push(pattern);
    this._whereClauses.push(`"${column}" ILIKE $${this._whereValues.length}`);
    return this;
  }

  // Alias for case-insensitive like
  ilike(column: string, pattern: string): this {
    return this.like(column, pattern);
  }

  // Get all results (alias for execute)
  async get(): Promise<any> {
    return this.execute();
  }

  // Get first result
  async first(): Promise<any | null> {
    this.limit(1);
    const result = await this.execute();
    return result.data[0] || null;
  }

  orderBy(column: string, direction: string = 'asc'): this {
    this._orderByClause = ` ORDER BY "${column}" ${direction.toUpperCase()}`;
    return this;
  }

  limit(n: number): this {
    this._whereValues.push(n);
    this._limitClause = ` LIMIT $${this._whereValues.length}`;
    return this;
  }

  offset(n: number): this {
    this._whereValues.push(n);
    this._offsetClause = ` OFFSET $${this._whereValues.length}`;
    return this;
  }

  insert(data: Record<string, any>): this {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data: Record<string, any>): this {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  returning(columns: string): this {
    this._returning = columns;
    return this;
  }

  private buildWhereClause(): string {
    if (this._whereClauses.length === 0) return '';
    return ` WHERE ${this._whereClauses.join(' AND ')}`;
  }

  private buildSQL(): { sql: string; params: any[] } {
    const whereStr = this.buildWhereClause();

    switch (this._operation) {
      case 'select': {
        const sql = `SELECT ${this._selectColumns} FROM "${this._table}"${whereStr}${this._orderByClause}${this._limitClause}${this._offsetClause}`;
        return { sql, params: this._whereValues };
      }

      case 'insert': {
        const data = this._insertData!;
        const keys = Object.keys(data).filter((k) => data[k] !== undefined);
        const values = keys.map((k) => data[k]);
        const placeholders = keys.map((_, i) => `$${i + 1}`);
        const columns = keys.map((k) => `"${k}"`);
        const ret = this._returning ? ` RETURNING ${this._returning}` : ' RETURNING *';
        const sql = `INSERT INTO "${this._table}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})${ret}`;
        return { sql, params: values };
      }

      case 'update': {
        const data = this._updateData!;
        const keys = Object.keys(data).filter((k) => data[k] !== undefined);
        // Reindex: update SET params come first, then WHERE params
        const setValues = keys.map((k) => data[k]);
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`);

        // Re-index where values
        const reindexedWhere = this._whereClauses.map((clause) => {
          return clause.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num) + keys.length}`);
        });

        const whereReindexed = reindexedWhere.length > 0 ? ` WHERE ${reindexedWhere.join(' AND ')}` : '';
        const ret = this._returning ? ` RETURNING ${this._returning}` : ' RETURNING *';
        const sql = `UPDATE "${this._table}" SET ${setClauses.join(', ')}${whereReindexed}${ret}`;
        return { sql, params: [...setValues, ...this._whereValues] };
      }

      case 'delete': {
        const ret = this._returning ? ` RETURNING ${this._returning}` : '';
        const sql = `DELETE FROM "${this._table}"${whereStr}${ret}`;
        return { sql, params: this._whereValues };
      }

      default:
        throw new Error(`Unknown operation: ${this._operation}`);
    }
  }

  async execute(): Promise<any> {
    const { sql, params } = this.buildSQL();
    const result = await this._pool.query(sql, params);
    // Array-shaped result with `.data` self-ref and `.count` so callers can
    // use both array methods and the {data, count} destructuring pattern.
    const arr: any = (result.rows || []).slice();
    arr.data = arr;
    arr.count = result.rowCount || arr.length;
    return arr;
  }

  // Alias for execute
  async then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (error) {
      if (reject) reject(error);
      else throw error;
    }
  }
}
