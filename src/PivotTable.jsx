import React from 'react';
import PropTypes from 'prop-types';
import {PivotData} from './Utilities';
import TableRenderers from './TableRenderers';

/* eslint-disable react/prop-types */
// eslint can't see inherited propTypes!
// 根据选择的图表类型：渲染对应的图表
class PivotTable extends React.PureComponent {
  render() {
    const Renderer = this.props.renderers[
      this.props.rendererName in this.props.renderers
        ? this.props.rendererName
        : Object.keys(this.props.renderers)[0]
    ];
    return <Renderer {...this.props} />;
  }
}

PivotTable.propTypes = Object.assign({}, PivotData.propTypes, {
  rendererName: PropTypes.string,
  renderers: PropTypes.objectOf(PropTypes.func),
});

PivotTable.defaultProps = Object.assign({}, PivotData.defaultProps, {
  rendererName: 'Table',
  renderers: TableRenderers,
});

export default PivotTable;
