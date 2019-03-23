const ajv = new require('ajv')();

const ERRNCL = `Unknown collection name. 
Please add a getter "collectionName" to the class`;
const proxyHandler = {
  get: (obj, prop) => {
    if (prop in obj) return obj[prop]
    return obj.collection[prop]
  }
};

class Mongel {

  constructor(db) {
    this.db = db;
    return new Proxy(this, proxyHandler)
  }


  get collection() {
    if (!this.collectionName) throw new Error(ERRNCL);
    return this.db.collection(this.collectionName);
  }

  insertOne(...args) {
    const valid = ajv.validate(this.schema, args[0]);
    if (!valid) return this.onReject(ajv.errors);
    return this.collection.insertOne(...args);
  }

  insertMany(...args) {
    const schema = {
      type: "array",
      items: { type: "object", ...this.schema }
    };
    const valid = ajv.validate(schema, args[0]);
    if (!valid) return this.onReject(ajv.errors);
    return this.collection.insertMany(...args);
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

  static onReject(errors) {
    console.error(errors);
  }

}

module.exports = Mongel;
