const ObjectID = require("mongodb").ObjectID;
const AJV = require("./validator.js");

const ERRNCL = `Unknown collection name. 
Please add a getter "collectionName" to the class`;
const proxyHandler = {
  get: (obj, prop) => {
    if (prop in obj) return obj[prop]
    return obj.collection[prop]
  }
};

class Zongel {

  constructor(md) {
    this.md = md;
    this.ajv = AJV(this.settings);
    if (this.customTypes) this.addCustomTypes();
    this.createUniques();
    return new Proxy(this, proxyHandler)
  }

  get settings() {
    return { additionalProperties: false };
  }

  get collection() {
    if (!this.collectionName) throw new Error(ERRNCL);
    return this.md.A.db.collection(this.collectionName);
  }

  get privateKeys() {
    return Object.keys(this.schema).filter(key => this.schema[key].private)
  }

  get requiredKeys() {
    return Object.keys(this.schema).filter(key => this.schema[key].required)
  }

  getAjvSchema(evenType) {
    const guestSchema = this[`${evenType}Schema`];
    const res = { ...this.schema };
    for (const key in guestSchema) {
      res[key] = { ...res[key], ...guestSchema[key] };
    }
    return { 
      additionalProperties: this.settings.additionalProperties,
      properties: res 
    };
  }

  get timestamps() { return { createdAt: 1, updatedAt: 1 }; }

  addCustomTypes() {
    this.customTypes.forEach(ct => {
      this.ajv.addType(ct.name, ct.opts);
    });
  }

  createUniques() {
    Object.keys(this.schema).forEach(key => {
      const prop = this.schema[key];
      if (!prop.unique) return;
      this.collection.createIndex({ [key]: 1 }, { unique: true })
    })
    if(this.compoundUnique)
      this.collection.createIndex(
        this.compoundUnique.reduce((obj, key) =>  ({ ...obj, [key]: 1 }) , {}),
        { unique: true }
      );
  }

  deletePrivate(item = {}) {
    this.privateKeys.forEach(key => { delete item[key]; })
    return item;
  }

  addQueryFields(options = {}) {
    if(this.privateKeys.length) options.projection = {};
    this.privateKeys.forEach(key => { options.projection[key] = 0; });
    return options;
  }

  async find(...args) {
    args[1] = this.addQueryFields(args[1]);
    return await this.collection.find(...args).toArray();
  }

  async aggregate(...args) {
    return await this.collection.aggregate(...args).toArray();
  }

  async findOne(...args) {
    if (typeof args[0]._id === "string") args[0]._id = new ObjectID(args[0]._id);
    args[1] = this.addQueryFields(args[1]);
    return await this.collection.findOne(...args);
  }

  async insertOne(...args) {
    const valid = this.ajv.validate(this.getAjvSchema("create"), args[0]);
    if (!valid) return this.onReject(this.ajv.errors);
    if (this.timestamps.createdAt) args[0].createdAt = new Date();
    const result = await this.collection.insertOne(...args);
    return this.allResult ? result : this.deletePrivate(result.ops[0])
  }

  async insertMany(...args) {
    const schema = {
      type: "array",
      items: { type: "object", ...this.getAjvSchema("create") }
    };
    const valid = this.ajv.validate(schema, args[0]);
    if (!valid) return this.onReject(this.ajv.errors);
    const result = await this.collection.insertMany(...args);
    return this.allResult ? result : result.ops
  }

  updateOne(...args) {
    args[1].$set = args[1].$set || {};
    this.validateUpdate(...args);
    if (this.timestamps.updatedAt)
      args[1].$set.updatedAt = new Date();
    return this.collection.updateOne(...args);
  }

  findOneAndUpdate(...args) {
    args[1].$set = args[1].$set || {};
    this.validateUpdate(...args);
    if (this.timestamps.updatedAt)
      args[1].$set.updatedAt = new Date();
    return this.collection.findOneAndUpdate(...args);
  }

  updateMany(...args) {
    this.validateUpdate(...args);
    return this.collection.updateMany(...args);
  }

  validateUpdate(...args) {
    const [,update,options = {} ] = args;
    const rawSchema = this.getAjvSchema("update");
    const schema = {properties: {}};
    Object.keys(update.$set).forEach(key => schema.properties[key] = rawSchema.properties[key])
    
    const cobay = options.adapt ? update.$set : {...update.$set};
    const setValid = this.ajv.validate(schema, cobay);
    if (!setValid) return this.onReject(this.ajv.errors);


    const isUnsettingRequired = args[1].$unset && Object.keys(args[1].$unset)
      .some(key => this.requiredKeys.includes(key));
    if (isUnsettingRequired)
      return this.onReject([{ message: 'Cannot unset required property' }]);
  }

  onReject(errors) {
    throw { code: "ZGLVLD", errors};
  }

}

module.exports = Zongel;
