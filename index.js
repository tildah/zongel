const ajv = require("./validator.js");

const ERRNCL = `Unknown collection name. 
Please add a getter "collectionName" to the class`;
const proxyHandler = {
  get: (obj, prop) => {
    if (prop in obj) return obj[prop]
    return obj.collection[prop]
  }
};

class Zongel {

  constructor(db) {
    this.db = db;
    return new Proxy(this, proxyHandler)
  }


  get collection() {
    if (!this.collectionName) throw new Error(ERRNCL);
    return this.db.collection(this.collectionName);
  }

  addQueryFields(options = {}) {
    options.projection = {};
    Object.keys(this.schema.properties).forEach(key => {
      const value = this.schema.properties[key];
      if(value.private) options.projection[key] = 0;
    });
    return options;
  }

  async find(...args) {
    args[1] = this.addQueryFields(args[1]);
    return await this.collection.find(...args).toArray();
  }

  async findOne(...args) {
    args[1] = this.addQueryFields(args[1]);
    return await this.collection.findOne(...args);
  }

  async insertOne(...args) {
    const valid = ajv.validate(this.schema, args[0]);
    if (!valid) return this.onReject(ajv.errors);
    const result = await this.collection.insertOne(...args);
    return this.allResult ? result : result.ops[0]
  }

  async insertMany(...args) {
    const schema = {
      type: "array",
      items: { type: "object", ...this.schema }
    };
    const valid = ajv.validate(schema, args[0]);
    if (!valid) return this.onReject(ajv.errors);
    const result = await this.collection.insertMany(...args);
    return this.allResult ? result : result.ops
  }

  updateOne(...args) {
    this.validateUpdate(...args);
    return this.collection.updateOne(...args);
  }

  updateMany(...args) {
    this.validateUpdate(...args);
    return this.collection.updateMany(...args);
  }

  validateUpdate(...args) {
    const setSchema = { ...this.schema };
    delete setSchema.required;
    const setValid = ajv.validate(setSchema, args[1].$set);
    if (!setValid) return this.onReject(ajv.errors);

    const unsetValid = this.schema.required.every(p => {
      return !args[1].$unset || !args[1].$unset.hasOwnProperty(p)
    })
    if (!unsetValid) return this.onReject([{ message: 'Cannot unset required property' }]);
  }

  onReject(errors) {
    throw new Error(errors.reduce((s, e) => s += `\n${e.dataPath} ${e.message}`, ""))
  }

}

module.exports = Zongel;
