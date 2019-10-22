import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {ScrollView, View, StyleSheet, Platform, RefreshControl, ViewPropTypes} from 'react-native';
import {shallowEqual, swapArrayElements} from './utils';
import Row from './Row';

const AUTOSCROLL_INTERVAL = 100;
const ZINDEX = Platform.OS === 'ios' ? 'zIndex' : 'elevation';

function uniqueRowKey(key) {
  return `${key}${uniqueRowKey.id}`
}

uniqueRowKey.id = 0

export default class SortableList extends Component {
  static propTypes = {
    data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
    order: PropTypes.arrayOf(PropTypes.any),
    style: ViewPropTypes.style,
    contentContainerStyle: ViewPropTypes.style,
    innerContainerStyle: ViewPropTypes.style,
    sortingEnabled: PropTypes.bool,
    scrollEnabled: PropTypes.bool,
    horizontal: PropTypes.bool,
    showsVerticalScrollIndicator: PropTypes.bool,
    showsHorizontalScrollIndicator: PropTypes.bool,
    refreshControl: PropTypes.element,
    autoscrollAreaSize: PropTypes.number,
    rowActivationTime: PropTypes.number,
    manuallyActivateRows: PropTypes.bool,

    renderRow: PropTypes.func.isRequired,
    renderHeader: PropTypes.func,
    renderFooter: PropTypes.func,

    onChangeOrder: PropTypes.func,
    onActivateRow: PropTypes.func,
    onReleaseRow: PropTypes.func,
    onMoveRow: PropTypes.func,

    onLayout: PropTypes.func
  };

  static defaultProps = {
    sortingEnabled: true,
    scrollEnabled: true,
    autoscrollAreaSize: 60,
    manuallyActivateRows: false,
    showsVerticalScrollIndicator: true,
    showsHorizontalScrollIndicator: true
  }

  /**
   * Stores refs to rows’ components by keys.
   */
  _rows = {};

  /**
   * Stores promises of rows’ layouts.
   */
  _rowsLayouts = {};
  _resolveRowLayout = {};

  _contentOffset = {x: 0, y: 0};

  state = {
    animated: false,
    order: this.props.order || Object.keys(this.props.data),
    rowsLayouts: null,
    containerLayout: null,
    data: this.props.data,
    activeRowKey: null,
    activeRowIndex: null,
    releasedRowKey: null,
    sortingEnabled: this.props.sortingEnabled,
    scrollEnabled: this.props.scrollEnabled
  };

  componentWillMount() {
    this.state.order.forEach((key) => {
      this._rowsLayouts[key] = new Promise((resolve) => {
        this._resolveRowLayout[key] = resolve;
      });
    });

    if (this.props.renderHeader && !this.props.horizontal) {
      this._headerLayout = new Promise((resolve) => {
        this._resolveHeaderLayout = resolve;
      });
    }
    if (this.props.renderFooter && !this.props.horizontal) {
      this._footerLayout = new Promise((resolve) => {
        this._resolveFooterLayout = resolve;
      });
    }
  }

  componentDidMount() {
    this._onUpdateLayouts();
  }

  componentWillReceiveProps(nextProps) {
    const {data, order} = this.state;
    let {data: nextData, order: nextOrder} = nextProps;

    if (data && nextData && !shallowEqual(data, nextData)) {
      nextOrder = nextOrder || Object.keys(nextData)
      uniqueRowKey.id++;
      this._rowsLayouts = {};
      nextOrder.forEach((key) => {
        this._rowsLayouts[key] = new Promise((resolve) => {
          this._resolveRowLayout[key] = resolve;
        });
      });

      if (Object.keys(nextData).length > Object.keys(data).length) {
        this.setState({
          animated: false,
          data: nextData,
          containerLayout: null,
          rowsLayouts: null,
          order: nextOrder
        });
      } else {
        this.setState({
          data: nextData,
          order: nextOrder
        });
      }

    } else if (order && nextOrder && !shallowEqual(order, nextOrder)) {
      this.setState({order: nextOrder});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const {data} = this.state;
    const {data: prevData} = prevState;

    if (data && prevData && !shallowEqual(data, prevData)) {
      this._onUpdateLayouts();
    }
  }

  scrollBy({dx = 0, dy = 0, animated = false}) {
    if (this.props.horizontal) {
      this._contentOffset.x += dx;
    } else {
      this._contentOffset.y += dy;
    }

    this._scroll(animated);
  }

  scrollTo({x = 0, y = 0, animated = false}) {
    if (this.props.horizontal) {
      this._contentOffset.x = x;
    } else {
      this._contentOffset.y = y;
    }

    this._scroll(animated);
  }

  scrollToRowKey({key, animated = false}) {
    const {order, containerLayout, rowsLayouts} = this.state;

    let keyX = 0;
    let keyY = 0;

    for (const rowKey of order) {
      if (rowKey === key) {
          break;
      }

      keyX += rowsLayouts[rowKey].width;
      keyY += rowsLayouts[rowKey].height;
    }

    // Scroll if the row is not visible.
    if (
      this.props.horizontal
        ? (keyX < this._contentOffset.x || keyX > this._contentOffset.x + containerLayout.width)
        : (keyY < this._contentOffset.y || keyY > this._contentOffset.y + containerLayout.height)
    ) {
      if (this.props.horizontal) {
        this._contentOffset.x = keyX;
      } else {
        this._contentOffset.y = keyY;
      }

      this._scroll(animated);
    }
  }

  render() {
    let {contentContainerStyle, innerContainerStyle, horizontal, style, showsVerticalScrollIndicator, showsHorizontalScrollIndicator} = this.props;
    const {animated, contentHeight, contentWidth, scrollEnabled} = this.state;
    const containerStyle = StyleSheet.flatten([style, {opacity: Number(animated)}])
    innerContainerStyle = [
      styles.rowsContainer,
      horizontal ? {width: contentWidth} : {height: contentHeight},
      innerContainerStyle
    ];
    let {refreshControl} = this.props;

    if (refreshControl && refreshControl.type === RefreshControl) {
      refreshControl = React.cloneElement(this.props.refreshControl, {
        enabled: scrollEnabled, // fix for Android
      });
    }

    return (
      <View style={containerStyle} ref={this._onRefContainer} onLayout={this._onContainerLayout}>
        <ScrollView
          refreshControl={refreshControl}
          ref={this._onRefScrollView}
          horizontal={horizontal}
          contentContainerStyle={contentContainerStyle}
          nestedScrollEnabled={true}
          scrollEventThrottle={2}
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          onScroll={this._onScroll}>
          {this._renderHeader()}
          <View style={innerContainerStyle}>
            {this._renderRows()}
          </View>
          {this._renderFooter()}
        </ScrollView>
      </View>
    );
  }

  _renderRows() {
    const {horizontal, rowActivationTime, sortingEnabled, renderRow} = this.props;
    const {animated, order, data, activeRowKey, associableRowKey, releasedRowKey, rowsLayouts} = this.state;


    let nextX = 0;
    let nextY = 0;

    return order.map((key, index) => {
      const style = {[ZINDEX]: 0};
      const location = {x: 0, y: 0};

      if (rowsLayouts) {
        if (horizontal) {
          location.x = nextX;
          nextX += rowsLayouts[key] ? rowsLayouts[key].width : 0;
        } else {
          location.y = nextY;
          nextY += rowsLayouts[key] ? rowsLayouts[key].height : 0;
        }
      }

      const active = activeRowKey === key;
      const associable = associableRowKey === key;
      const released = releasedRowKey === key;

      if (active || released) {
        style[ZINDEX] = 100;
      }

      return (
        <Row
          key={uniqueRowKey(key)}
          ref={this._onRefRow.bind(this, key)}
          horizontal={horizontal}
          activationTime={rowActivationTime}
          animated={animated && !active}
          disabled={!sortingEnabled}
          style={style}
          location={location}
          onLayout={!rowsLayouts ? this._onLayoutRow.bind(this, key) : null}
          onActivate={this._onActivateRow.bind(this, key, index)}
          onPress={this._onPressRow.bind(this, key)}
          onRelease={this._onReleaseRow.bind(this, key)}
          onMove={this._onMoveRow}
          manuallyActivateRows={this.props.manuallyActivateRows}>
          {renderRow({
            key,
            data: data[key],
            disabled: !sortingEnabled,
            active,
						associable,
            index,
          })}
        </Row>
      );
    });
  }

  _renderHeader() {
    if (!this.props.renderHeader || this.props.horizontal) {
      return null;
    }

    const {headerLayout} = this.state;

    return (
      <View onLayout={!headerLayout ? this._onLayoutHeader : null}>
        {this.props.renderHeader()}
      </View>
    );
  }

  _renderFooter() {
    if (!this.props.renderFooter || this.props.horizontal) {
      return null;
    }

    const {footerLayout} = this.state;

    return (
      <View onLayout={!footerLayout ? this._onLayoutFooter : null}>
        {this.props.renderFooter()}
      </View>
    );
  }

  _onUpdateLayouts() {
    Promise.all([this._headerLayout, this._footerLayout, ...Object.values(this._rowsLayouts)])
      .then(([headerLayout, footerLayout, ...rowsLayouts]) => {
        // Can get correct container’s layout only after rows’s layouts.
        this._container.measure((x, y, width, height, pageX, pageY) => {
          const rowsLayoutsByKey = {};
          let contentHeight = 0;
          let contentWidth = 0;

          rowsLayouts.forEach(({rowKey, layout}) => {
            rowsLayoutsByKey[rowKey] = layout;
            contentHeight += layout.height;
            contentWidth += layout.width;
          });

          this.setState({
            containerLayout: {x, y, width, height, pageX, pageY},
            rowsLayouts: rowsLayoutsByKey,
            headerLayout,
            footerLayout,
            contentHeight,
            contentWidth,
          }, () => {
            this.setState({animated: true});
          });
        });
      });
  }

  _scroll(animated) {
    this._scrollView.scrollTo({...this._contentOffset, animated});
  }

	_findRowToAssociate() {
  	const {activeRowKey} = this.state;

  	if (activeRowKey !== null) {
			const rowUnderActive = this._findRowUnderActiveRow();

			if (rowUnderActive) {
				const {
					rowKey: rowUnderActiveKey,
					rowIndex: rowUnderActiveIndex,
				} = rowUnderActive;

				this.setState({
					associableRowKey: rowUnderActiveKey,
					associableRowIndex: rowUnderActiveIndex
				});
			} else {
				this.setState({
					associableRowKey: null,
					associableRowIndex: null
				})
			}
		}
	}

  /**
   * Finds a row, which was covered with the moving row’s half.
   */
  _findRowUnderActiveRow() {
    const {horizontal} = this.props;
    const {rowsLayouts, activeRowKey, activeRowIndex, order} = this.state;
    const movingRowLayout = rowsLayouts[activeRowKey];
    const rowLeftX = this._activeRowLocation.x;
    const rowRightX = rowLeftX + movingRowLayout.width;
    const rowTopY = this._activeRowLocation.y;
    const rowBottomY = rowTopY + movingRowLayout.height;

    for (
      let currentRowIndex = 0, x = 0, y = 0, rowsCount = order.length;
      currentRowIndex < rowsCount;
      currentRowIndex++
    ) {
      const currentRowKey = order[currentRowIndex];
      const currentRowLayout = rowsLayouts[currentRowKey];

      x += currentRowLayout.width;
      y += currentRowLayout.height;

      if (currentRowKey !== activeRowKey) {

				if (
					rowTopY <= (y - (currentRowLayout.height / 2))  &&
					rowBottomY >= (y - (currentRowLayout.height / 2))
				) {
					// console.log(
					// 	"rowTopY:", rowTopY, "\n",
					// 	"rowBottomY:", rowBottomY, "\n",
					// 	"x:", x, "\n",
					// 	"y:", y, "\n",
					// 	"currentRowLayout height:", currentRowLayout.height, "\n",
					// 	"currentRowKey:", currentRowKey, "\n",
					// 	"activeRowKey:", activeRowKey
					// );

					return {
						rowKey: order[currentRowIndex],
						rowIndex: currentRowIndex,
					};
				}
			}
    }
  }

  _scrollOnMove(e) {
    const {pageX, pageY} = e.nativeEvent;
    const {horizontal} = this.props;
    const {containerLayout} = this.state;
    let inAutoScrollBeginArea = false;
    let inAutoScrollEndArea = false;

    if (horizontal) {
      inAutoScrollBeginArea = pageX < containerLayout.pageX + this.props.autoscrollAreaSize;
      inAutoScrollEndArea = pageX > containerLayout.pageX + this.containerLayout.width - this.props.autoscrollAreaSize;
    } else {
      inAutoScrollBeginArea = pageY < containerLayout.pageY + this.props.autoscrollAreaSize;
      inAutoScrollEndArea = pageY > containerLayout.pageY + this.containerLayout.height - this.props.autoscrollAreaSize;
    }

    if (!inAutoScrollBeginArea &&
      !inAutoScrollEndArea &&
      this._autoScrollInterval !== null
    ) {
      this._stopAutoScroll();
    }

    // It should scroll and scrolling is processing.
    if (this._autoScrollInterval !== null) {
      return;
    }

    if (inAutoScrollBeginArea) {
      this._startAutoScroll({
        direction: -1,
        shouldScroll: () => this._contentOffset[horizontal ? 'x' : 'y'] > 0,
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const contentOffset = this._contentOffset[horizontal ? 'x' : 'y'];

          return contentOffset - nextStep < 0 ? contentOffset : nextStep;
        },
      });
    } else if (inAutoScrollEndArea) {
      this._startAutoScroll({
        direction: 1,
        shouldScroll: () => {
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          if (horizontal) {
            return this._contentOffset.x < contentWidth - this.containerLayout.width
          } else {
            return this._contentOffset.y < contentHeight + footerLayout.height - this.containerLayout.height;
          }
        },
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          if (horizontal) {
            return this._contentOffset.x + nextStep > contentWidth - this.containerLayout.width
              ? contentWidth - this.containerLayout.width - this._contentOffset.x
              : nextStep;
          } else {
            const scrollHeight = contentHeight + footerLayout.height - this.containerLayout.height;

            return this._contentOffset.y + nextStep > scrollHeight
              ? scrollHeight - this._contentOffset.y
              : nextStep;
          }
        },
      });
    }
  }

  _getScrollStep(stepIndex) {
    return stepIndex > 3 ? 60 : 30;
  }

  _startAutoScroll({direction, shouldScroll, getScrollStep}) {
    if (!shouldScroll()) {
      return;
    }

    const {activeRowKey} = this.state;
    const {horizontal} = this.props;
    let counter = 0;

    this._autoScrollInterval = setInterval(() => {
      if (shouldScroll()) {
        const movement = {
          [horizontal ? 'dx' : 'dy']: direction * getScrollStep(counter++),
        };

        this.scrollBy(movement);
        this._rows[activeRowKey].moveBy(movement);
      } else {
        this._stopAutoScroll();
      }
    }, AUTOSCROLL_INTERVAL);
  }

  _stopAutoScroll() {
    clearInterval(this._autoScrollInterval);
    this._autoScrollInterval = null;
  }

  _onLayoutRow(rowKey, {nativeEvent: {layout}}) {
    this._resolveRowLayout[rowKey]({rowKey, layout});
  }

  _onLayoutHeader = ({nativeEvent: {layout}}) => {
    this._resolveHeaderLayout(layout);
  };

  _onLayoutFooter = ({nativeEvent: {layout}}) => {
    this._resolveFooterLayout(layout);
  };

  _onActivateRow = (rowKey, index, e, gestureState, location) => {
    this._activeRowLocation = location;

    this.setState({
      activeRowKey: rowKey,
      activeRowIndex: index,
      releasedRowKey: null,
      scrollEnabled: false,
    });

    if (this.props.onActivateRow) {
      this.props.onActivateRow(rowKey);
    }
  };

  _onPressRow = (rowKey) => {
    if (this.props.onPressRow) {
      this.props.onPressRow(rowKey);
    }
  };

  _onReleaseRow = (rowKey) => {
    this._prevSwapedRowKey = null;
    this._stopAutoScroll();

    const {data} = this.props;
    const {associableRowKey} = this.state;

		this.props.onReleaseRow(data[rowKey], data[associableRowKey]);

    this.setState(({activeRowKey}) => ({
      activeRowKey: null,
      activeRowIndex: null,
			associableRowKey: null,
			associableRowIndex: null,
      releasedRowKey: activeRowKey,
      scrollEnabled: this.props.scrollEnabled,
    }));
  };

  _onMoveRow = (e, gestureState, location, activeRow) => {
    const prevMovingRowX = this._activeRowLocation.x;
    const prevMovingRowY = this._activeRowLocation.y;
    const prevMovingDirection = this._movingDirection;

    this._activeRowLocation = location;
    this._movingDirection = this.props.horizontal
      ? prevMovingRowX < this._activeRowLocation.x
      : prevMovingRowY < this._activeRowLocation.y;

		this._findRowToAssociate();
		this.props.onMoveRow(e, gestureState, location, activeRow);

    if (this.props.scrollEnabled) {
      this._scrollOnMove(e);
    }
  };

  _onScroll = ({nativeEvent: {contentOffset}}) => {
      this._contentOffset = contentOffset;
  };

  _onRefContainer = (component) => {
    this._container = component;
  };

  _onRefScrollView = (component) => {
    this._scrollView = component;
  };

  _onRefRow = (rowKey, component) => {
    this._rows[rowKey] = component;
  };

  _onContainerLayout = ({ nativeEvent: { layout }}) => {
    this.containerLayout = layout;
    this.props.onLayout(layout);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  rowsContainer: {
    flex: 1,
    zIndex: 1,
  },
});
