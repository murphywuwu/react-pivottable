import React from 'react'
import PropTypes from 'prop-types';

const numberFormat = function (opts_in) {

}

const usFmtInt = numberFormat({ digitsAfterDecimal: 0 })

const aggregatorTemplates = {
  // 第一步：初始化选择聚合函数，返回聚合函数
  count(formatter = usFmtInt) {
    // 第二步：(可注入数据)返回聚合对象
    return () => function() {
      return {
        count: 0,
        // 推入值
        push() {
          this.count++;
        },
        // 返回值
        value() {
          return this.count;
        },
        format: formatter,
      }
    }
  },
  uniques(fn, formatter = usFmtInt) {
    return function ([attr]) {
      return function () {
        return {
          uniq: [],
          push(record) {
            if (!Array.from(this.uniq).includes(record[attr])) {
              this.uniq.push(record[attr]);
            }
          },
          value() {
            return fn(this.uniq);
          },
          format: formatter,
          numInputs: typeof attr !== 'undefined' ? 0 : 1,
        }
      }
    }
  }
}

const aggregators = (tpl => ({
  // usFmtInt: Int类型数值,格式处理函数
  Count: tpl.count(usFmtInt)
}))(aggregatorTemplates)

class PivotData {
  constructor(inputProps = {}) {
    this.props = Object.assign({}, PivotData.defaultProps, inputProps);
    PropTypes.checkPropTypes(
      PivotData.propTypes,
      this.props,
      'prop',
      'PivotData'
    );

    this.aggregator = this.props.aggregators[this.props.aggregatorName](this.props.vals);
    
    this.tree = {};
    this.rowKeys = {};
    this.colKeys = {};
    this.rowTotals = {};
    this.colTotals = {};
    this.allTotal = this.aggregator(this, [], [])
    
    // 初始化数据
    PivotData.forEachRecord(
      this.props.data,
      this.props.derivedAttributes,
      record => {
        if (this.filter(record)) {
          this.processRecord(record)
        }
      }
    )
  }
  filter(record) {
    // 
    for (const k in this.props.valueFilter) {
      if (record[k] in this.props.valueFilter[k]) {
        return false
      }
    }
    return true;
  }

  forEachMatchingRecord(criteria, callback) {
    // 对于符合条件的值，执行回调函数，否则则退出该函数
    return PivotData.forEachRecord(
      this.props.data, 
      this.props.derivedAttributes,
      record => {
        if (!this.filter(record)) {
          return;
        }
        for (const k in criteria) {
          const v = criteria[k];
          // 如果record中的值和criteria中的值不相等，则退出该函数
          if (v !== (k in record ? record[k] : null)) {
            return;
          }
        }
        // 否则意味着该值通过了验证，传回给客户端
        callback(record);
      }
    )
  }
  getColKeys() {
    return this.colKeys;
  }
  getRowKeys() {
    return this.rowKeys;
  }
  processRecord(record) {
    const colKey = [];
    const rowKey = [];

    // colKey: 代表这个数据的值属于那一列
    for (const x of Array.from(this.props.cols)) {
      colKey.push(x in record ? record[x] : 'null');      
    }
    // rowKey: 代表这个数据属于那一行
    for (const x in Array.from(this.props.rows)) {
      rowKey.push(x in record ? record[k] : 'null');
    }
    const flatRowKey = rowKey.join(String.fromCharCode(0));
    const flatColKey = colKey.join(String.fromCharCode(0))

    this.allTotal.push(record);

    if (rowKey.length !== 0) {
      if (!this.rowTotals[flatRowKey]) {
        this.rowKeys.push(rowKey);
        // 为每一行设置自己的聚合对象
        this.rowTotals[flatRowKey] = this.aggregator(this, rowKey, []);
      } 
      // 通过每一行自己聚合对象的push函数，推入属于这一行的每个值
      this.rowTotals[flatRowKey].push(record);
    }

    if (colKey.length !== 0) {
      if (!this.colTotals[flatColKey]) {
        this.colKeys.push(rowKey);
        // 为每一列设置自己的聚合对象
        this.colTotals[flatColKey] = this.aggregator(this, [], colKey);
      }
      // 通过每一列自己聚合对象的push函数，推入属于这一列的每个值
      this.colTotals[flatColKey].push(record)
    }

    if (colKey.length !== 0 && rowKey.length !== 0) {
      if (!this.tree[flatRowKey]) {
        this.tree[flatRowKey] = {};
      }
      if (!this.tree[flatRowKey][flatColKey]) {
        // 为处于某行某列的数据设置自己的聚合对象
        this.tree[flatRowKey][flatColKey] = this.aggregator(this, rowKey, colKey);
      }

      // 通过某行某列自己聚合对象的push函数，推入属于这一行这一列的值
      this.tree[flatRowKey][flatColKey].push(record)
    }
  }
  getAggregator(rowKey, colKey) {
    let agg;
    const flatRowKey = rowKey.join(String.fromCharCode(0));
    const flatColKey = colKey.join(String.fromCharCode(0));
    
    if (rowKey.length === 0 && colKey.length === 0) {
      agg = this.allTotal;
    }
    else if (rowKey.length === 0) {
      agg = this.colTotals[flatColKey];
    }
    else if (colKey.length === 0) {
      agg = this.rowTotals[flatRowKey];
    }
    else {
      agg = this.tree[flatRowKey][flatColKey]
    }

    return (
      agg || {
        value() {
          return null;
        },
        format() {
          return '';
        }
      }
    )
  }
}

PivotData.forEachRecord = function(input, derivedAttributes, f) {
  let addRecord, record;
  // 默认状态
  if (Object.getOwnPropertyNames(derivedAttributes.length == 0)) {
    addRecord = f; 
  }
  else {
    addRecord = function (record) {
      for (const k in derivedAttributes) {
        // 通过derivedAttributes的值批量计算record并返回一个值，如果返回的值derived不为null
        // 则将该derived值挂载在record
        const derived = derivedAttributes[k](record);
        if (derived !== null) {
          record[k] = derived
        }
      }

      // 调用默认回调函数，处理record数据
      return f(record)
    }
  }
  // with function input
  if (typeof input === 'function') {
    return input(addRecord)
  }
  else if (Array.isArray(input)) {
    // array of array
    if (Array.isArray(input[0])) {
      return (() => {
        const result = [];
        
        for (const i of Object.keys(input || {})) {
          const compactRecord = input[i];
          // filter input[0]
          if (i > 0) {
            record = {};
            // input     [['a', 'b'], [1, 2], [3, 4]];
            // input[0]: ['a', 'b']
            for (const j of Object.keys(input[0] || {})) {
              const k = input[0][j];
              record[k] = compactRecord[j]
            }
            // output: [{ a: 1, b: 2 }, { a: 3, b: 4 }]
            result.push(addRecord(record))
          }
        }
        
        return result;
      })()
    }

    // array of object
    return (() => {
      const result1 = [];

      // Array.from
      // 从一个类似数组或可迭代对象中创建一个新的，浅拷贝的数组实例
      for (record of Array.from(input)) {
        result1.push(addRecord(record))
      }

      return result1;
    })()
  }

  throw new Error('unknown input format')
}

PivotData.defaultProps = {
  aggregators: aggregators,
  cols: [],
  rows: [],
  vals: [],
  aggregatorName: 'Count',
  sorters: {},
  valueFilter: {},
  rowOrder: 'key_a_to_z',
  colOrder: 'key_a_to_z',
  // 默认设置为对象
  derivedAttributes: {},
};

PivotData.propTypes = {
  // 支持三种类型的数据
  // 1.[['a', 'b'], [1, 2], [3, 4]]
  // 2.[{ a: 1, b: 2 }, { a: 3, b: 4 }]
  // 3.const functionInput = function(record) {
  //   record({ a: 1, b: 2 });
  //   record({ a: 3, b: 4 })
  // }
    
  data: PropTypes.oneOfType([PropTypes.array, PropTypes.object, PropTypes.func])
    .isRequired, 
  aggregatorName: PropTypes.string,
  cols: PropTypes.arrayOf(PropTypes.string),
  rows: PropTypes.arrayOf(PropTypes.string),
  vals: PropTypes.arrayOf(PropTypes.string),
  valueFilter: PropTypes.objectOf(PropTypes.objectOf(PropTypes.bool)),
  sorters: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.objectOf(PropTypes.func),
  ]),
  derivedAttributes: PropTypes.objectOf(PropTypes.func),
  rowOrder: PropTypes.oneOf(['key_a_to_z', 'value_a_to_z', 'value_z_to_a']),
  colOrder: PropTypes.oneOf(['key_a_to_z', 'value_a_to_z', 'value_z_to_a']),
};
