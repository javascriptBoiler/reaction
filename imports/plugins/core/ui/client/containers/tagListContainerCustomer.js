import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "lodash";
import update from "immutability-helper";
import { compose } from "recompose";
import { registerComponent, composeWithTracker, Components } from "@reactioncommerce/reaction-components";
import { Meteor } from "meteor/meteor";
import { Reaction, i18next } from "/client/api";
import TagListCustomer from "../components/tags/tagListCustomer";
import { Tags } from "/lib/collections";
import { getTagIds } from "/lib/selectors/tags";


const wrapComponent = (Comp) => (
  class TagListContainer extends Component {
    static propTypes = {
      children: PropTypes.node,
      hasPermission: PropTypes.bool,
      product: PropTypes.object,
      tagIds: PropTypes.arrayOf(PropTypes.string),
      tagsAsArray: PropTypes.arrayOf(PropTypes.object),
      tagsByKey: PropTypes.object
    }

    constructor(props) {
      super(props);

      this.state = {
        tagIds: props.tagIds || [],
        tagsByKey: props.tagsByKey || {},
      };
    }

    componentWillReceiveProps(nextProps) {
      this.setState({
        tagIds: nextProps.tagIds || [],
        tagsByKey: nextProps.tagsByKey || {}
      });
    }

    get productId() {
      if (this.props.product) {
        return this.props.product._id;
      }
      return null;
    }

    get tags() {
      return this.props.tagsAsArray;
    }

    render() {
      return (
        <Comp
          onClick={this.handleEditButtonClick}
          tags={this.tags}
          {...this.props}
        />
      );
    }
  }
);

function composer(props, onData) {
  let { tags } = props;

  if (props.product) {
    if (_.isArray(props.product.hashtags)) {
      tags = Tags.find({ _id: { $in: props.product.hashtags } }).fetch();
    }
  }

  const tagsByKey = {};

  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (tag) {
        tagsByKey[tag._id] = tag;
      }
    }
  }

  onData(null, {
    isProductTags: props.product !== undefined,
    tagIds: getTagIds({ tags }),
    tagsByKey,
    tagsAsArray: tags,
  });
}

registerComponent("TagListCustomer", TagListCustomer, [
  composeWithTracker(composer),
  wrapComponent
]);

export default compose(
  composeWithTracker(composer),
  wrapComponent
)(TagListCustomer);
