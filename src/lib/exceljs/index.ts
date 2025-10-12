export type WorksheetViews = {
  state: string;
  ySplit?: number;
  xSplit?: number;
}[];

type CellValue = string | number | { formula: string } | undefined;

class Cell {
  constructor(private readonly row: Row, private readonly index: number) {}

  get value(): CellValue {
    return this.row.getValue(this.index);
  }

  set value(value: CellValue) {
    this.row.setValue(this.index, value);
  }
}

class Column {
  width?: number;
}

class Row {
  private readonly values: CellValue[] = [];

  constructor(private readonly worksheet: Worksheet, readonly number: number) {}

  getCell(index: number): Cell {
    return new Cell(this, index);
  }

  setValue(index: number, value: CellValue) {
    this.values[index] = value;
  }

  getValue(index: number): CellValue {
    return this.values[index];
  }

  get valuesArray(): CellValue[] {
    const values = [...this.values];
    values[0] = undefined;
    return values;
  }
}

class Worksheet {
  readonly rows = new Map<number, Row>();
  readonly columns = new Map<number, Column>();
  readonly views: WorksheetViews;
  private rowCountValue = 0;

  constructor(readonly name: string, options?: { views?: WorksheetViews }) {
    this.views = options?.views ?? [];
  }

  addRow(values: CellValue[]): Row {
    const rowNumber = this.rowCountValue + 1;
    const row = this.getRow(rowNumber);
    values.forEach((value, index) => {
      row.setValue(index + 1, value);
    });
    return row;
  }

  getRow(index: number): Row {
    let row = this.rows.get(index);
    if (!row) {
      row = new Row(this, index);
      this.rows.set(index, row);
      if (index > this.rowCountValue) {
        this.rowCountValue = index;
      }
    }
    return row;
  }

  getColumn(index: number): Column {
    let column = this.columns.get(index);
    if (!column) {
      column = new Column();
      this.columns.set(index, column);
    }
    return column;
  }

  getCell(address: string): Cell {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match) {
      throw new Error(`Invalid cell address: ${address}`);
    }
    const [, letters, rowPart] = match;
    const columnIndex = letters
      .split('')
      .reduce((accumulator, char) => accumulator * 26 + (char.charCodeAt(0) - 64), 0);
    const rowIndex = Number(rowPart);
    if (!Number.isFinite(rowIndex)) {
      throw new Error(`Invalid row index: ${address}`);
    }
    return this.getRow(rowIndex).getCell(columnIndex);
  }

  toJSON() {
    return {
      name: this.name,
      rows: Array.from(this.rows.entries()).map(([index, row]) => ({
        index,
        values: row.valuesArray,
      })),
      columns: Array.from(this.columns.entries()).map(([index, column]) => ({
        index,
        width: column.width,
      })),
      views: this.views,
    };
  }

  get rowCount(): number {
    return this.rowCountValue;
  }
}

class Workbook {
  readonly worksheets: Worksheet[] = [];

  addWorksheet(name: string, options?: { views?: WorksheetViews }): Worksheet {
    const worksheet = new Worksheet(name, options);
    this.worksheets.push(worksheet);
    return worksheet;
  }

  getWorksheet(name: string): Worksheet | undefined {
    return this.worksheets.find((sheet) => sheet.name === name);
  }

  get xlsx() {
    return {
      writeBuffer: async () =>
        Buffer.from(
          JSON.stringify({ worksheets: this.worksheets.map((sheet) => sheet.toJSON()) }),
          'utf8'
        ),
    };
  }
}

const ExcelJS = { Workbook };

export type { Workbook, Worksheet };
export default ExcelJS;
