/* eslint dot-notation: 0 */
/* eslint prefer-arrow-callback:0 */
import Random from "@reactioncommerce/random";
import { Meteor } from "meteor/meteor";
import { check, Match } from "meteor/check";
import { Factory } from "meteor/dburles:factory";
import ReactionError from "@reactioncommerce/reaction-error";
import Reaction from "/imports/plugins/core/core/server/Reaction";
import { Cart, Products, Accounts } from "/lib/collections";
import { expect } from "meteor/practicalmeteor:chai";
import { sinon } from "meteor/practicalmeteor:sinon";
import { getShop, getAddress } from "/imports/plugins/core/core/server/fixtures/shops";
import { addProduct } from "/imports/plugins/core/core/server/fixtures/products";
import Fixtures from "/imports/plugins/core/core/server/fixtures";

Fixtures();

describe("Add/Create cart methods", function () {
  const user = Factory.create("user");
  const account = Factory.create("account", { userId: user._id });
  const shop = getShop();
  const accountId = account._id;
  const userId = user._id;
  let sandbox;
  let originals;

  before(function () {
    originals = {
      mergeCart: Meteor.server.method_handlers["cart/mergeCart"],
      createCart: Meteor.server.method_handlers["cart/createCart"],
      copyCartToOrder: Meteor.server.method_handlers["cart/copyCartToOrder"],
      addToCart: Meteor.server.method_handlers["cart/addToCart"]
    };
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  after(() => {
    Meteor.users.remove({});
  });

  afterEach(function () {
    Meteor.users.remove({});
  });


  function spyOnMethod(method, id) {
    return sandbox.stub(Meteor.server.method_handlers, `cart/${method}`, function (...args) {
      check(args, [Match.Any]); // to prevent audit_arguments from complaining
      this.userId = id;
      return originals[method].apply(this, args);
    });
  }

  describe("cart/createCart", function () {
    it("should create a test cart", function () {
      sandbox.stub(Reaction, "getPrimaryShopId", () => shop._id);
      sandbox.stub(Meteor, "userId", () => userId);
      const cartInsertSpy = sandbox.spy(Cart, "insert");
      const cartId = Meteor.call("cart/createCart");
      const cart = Cart.findOne({ accountId });
      expect(cartInsertSpy).to.have.been.called;
      expect(cartId).to.equal(cart._id);
    });
  });

  describe("cart/addToCart", function () {
    const quantity = 1;
    let product;
    let productId;
    let variantId;
    let permissionStub;

    before(function () {
      permissionStub = sinon.stub(Reaction, "hasPermission", function () {
        return true;
      });

      product = addProduct();
      productId = product._id;
      variantId = Products.findOne({
        ancestors: [productId]
      })._id;
    });

    after(function () {
      permissionStub.restore();
    });

    beforeEach(function () {
      Cart.remove({});
    });

    it("should add item to cart", function (done) {
      let cart = Factory.create("cart", { accountId });
      const items = cart.items.length;
      spyOnMethod("addToCart", userId);
      Meteor.call("cart/addToCart", productId, variantId, quantity);
      cart = Cart.findOne({ _id: cart._id });
      expect(cart.items.length).to.equal(items + 1);
      expect(cart.items[cart.items.length - 1].productId).to.equal(productId);
      done();
    });

    it("should merge all items of same variant in cart", function () {
      sandbox.stub(Reaction, "getShopId", () => shop._id);
      sandbox.stub(Meteor, "userId", () => userId);
      spyOnMethod("addToCart", userId);
      const cartId = Meteor.call("cart/createCart");

      Meteor.call("cart/addToCart", productId, variantId, quantity);
      // add a second item of same variant
      Meteor.call("cart/addToCart", productId, variantId, quantity);
      const cart = Cart.findOne({ _id: cartId });
      expect(cart.items.length).to.equal(1);
      expect(cart.items[0].quantity).to.equal(2);
    });

    it("should throw error an exception if user doesn't have a cart", function (done) {
      const userWithoutCart = Factory.create("user");
      spyOnMethod("addToCart", userWithoutCart._id);
      function addToCartFunc() {
        return Meteor.call("cart/addToCart", productId, variantId, quantity);
      }
      expect(addToCartFunc).to.throw(ReactionError, /Cart not found/);
      return done();
    });

    it("should throw error an exception if product doesn't exists", function (done) {
      spyOnMethod("addToCart", userId);
      function addToCartFunc() {
        return Meteor.call("cart/addToCart", "fakeProductId", variantId, quantity);
      }
      expect(addToCartFunc).to.throw(ReactionError, "Product with such id was not found [not-found]");
      return done();
    });
  });

  describe("cart/copyCartToOrder", function () {
    it("should throw error if cart user not current user", function (done) {
      const cart = Factory.create("cart", { accountId });
      spyOnMethod("copyCartToOrder", "wrongUserId");
      function copyCartFunc() {
        return Meteor.call("cart/copyCartToOrder", cart._id);
      }
      expect(copyCartFunc).to.throw(ReactionError, /Access Denied/);
      return done();
    });

    it("should throw error if cart has no items", function (done) {
      const user1 = Factory.create("user");
      sandbox.stub(Meteor, "userId", () => user1._id);
      sandbox.stub(Reaction, "getShopId", function () {
        return shop._id;
      });

      sandbox.stub(Accounts, "findOne", function () {
        return {
          emails: [{
            address: "test@localhost",
            provides: "default"
          }]
        };
      });
      spyOnMethod("copyCartToOrder", user1._id);
      const cartId = Meteor.call("cart/createCart");
      function copyCartFunc() {
        return Meteor.call("cart/copyCartToOrder", cartId);
      }
      expect(copyCartFunc).to.throw(ReactionError, /Missing cart items/);
      return done();
    });

    it("should throw an error if order creation has failed", function () {
      const cart = Factory.create("cartToOrder");
      spyOnMethod("copyCartToOrder", userId);
      // The main moment of test. We are spy on `insert` operation but do not
      // let it through this call
      const insertStub = sandbox.stub(Reaction.Collections.Orders, "insert");
      function copyCartFunc() {
        return Meteor.call("cart/copyCartToOrder", cart._id);
      }
      expect(copyCartFunc).to.throw(ReactionError, /Invalid request/);
      expect(insertStub).to.have.been.called;
    });

    it("should create an order", function (done) {
      const cart = Factory.create("cartToOrder");
      sandbox.stub(Reaction, "getShopId", function () {
        return cart.shopId;
      });
      spyOnMethod("copyCartToOrder", userId);
      // let's keep it simple. We don't want to see a long email about
      // success. But I leave it here in case if anyone want to check whole
      // method flow.
      const insertStub = sandbox.stub(Reaction.Collections.Orders, "insert");
      function copyCartFunc() {
        return Meteor.call("cart/copyCartToOrder", cart._id);
      }

      expect(copyCartFunc).to.throw(ReactionError, /Invalid request/);
      expect(insertStub).to.have.been.called;
      return done();
    });
  });

  describe("cart/unsetAddresses", function () {
    it("should correctly remove addresses from cart", function (done) {
      let cart = Factory.create("cart", { accountId });
      spyOnMethod("setShipmentAddress", userId);
      spyOnMethod("setPaymentAddress", userId);

      const cartId = cart._id;
      const address = Object.assign({}, getAddress(), {
        _id: Random.id(),
        isShippingDefault: true,
        isBillingDefault: true
      });

      Meteor.call("cart/setPaymentAddress", cartId, null, address);
      Meteor.call("cart/setShipmentAddress", cartId, null, address);
      cart = Cart.findOne({ _id: cartId });
      expect(cart).not.to.be.undefined;
      expect(cart.shipping[0].address._id).to.equal(address._id);
      expect(cart.billing[0].address._id).to.equal(address._id);

      // our Method checking
      Meteor.call("cart/unsetAddresses", cartId, null, address._id);

      cart = Cart.findOne({ _id: cartId });
      expect(cart).to.not.be.undefined;
      expect(cart.shipping[0].address).to.be.undefined;
      expect(cart.billing[0].address).to.be.undefined;
      return done();
    });

    it("should throw error if wrong arguments were passed", function (done) {
      const accountUpdateStub = sandbox.stub(Accounts, "update");

      expect(function () {
        return Meteor.call("cart/unsetAddresses", 123456);
      }).to.throw();

      expect(function () {
        return Meteor.call("cart/unsetAddresses", {});
      }).to.throw();

      expect(function () {
        return Meteor.call("cart/unsetAddresses", null);
      }).to.throw();

      expect(function () {
        return Meteor.call("cart/unsetAddresses");
      }).to.throw();

      expect(function () {
        return Meteor.call("cart/unsetAddresses", "asdad", 123);
      }).to.throw();

      // https://github.com/aldeed/meteor-simple-schema/issues/522
      expect(function () {
        return Meteor.call("accounts/addressBookRemove", () => {
          expect(true).to.be.true;
        });
      }).to.not.throw();

      expect(accountUpdateStub).to.not.have.been.called;
      accountUpdateStub.restore();
      return done();
    });

    it("should update cart via `type` argument", function (done) {
      let cart = Factory.create("cart", { accountId });
      spyOnMethod("setShipmentAddress", userId);
      spyOnMethod("setPaymentAddress", userId);

      const cartId = cart._id;
      const address = Object.assign({}, getAddress(), {
        _id: Random.id(),
        isShippingDefault: true,
        isBillingDefault: true
      });
      Meteor.call("cart/setPaymentAddress", cartId, null, address);
      Meteor.call("cart/setShipmentAddress", cartId, null, address);
      cart = Cart.findOne({ _id: cartId });

      expect(cart.shipping[0].address._id).to.equal(address._id);
      expect(cart.billing[0].address._id).to.equal(address._id);

      Meteor.call("cart/unsetAddresses", cartId, null, address._id, "billing");
      Meteor.call("cart/unsetAddresses", cartId, null, address._id, "shipping");

      cart = Cart.findOne({ _id: cartId });

      expect(cart.shipping[0].address).to.be.undefined;
      expect(cart.billing[0].address).to.be.undefined;
      return done();
    });
  });
});
