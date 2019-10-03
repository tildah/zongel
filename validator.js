const Ajv = require("super-ajv");
const ObjectID = require("mongodb").ObjectID;

const ajv = new Ajv({
  coerceTypes: true,
  useDefaults: true,
  removeAdditional: true
});

ajv.addType("date", {
  format: "date",
  modifying: true,
  compile: (...args) => {
    return (data, path, object, prop) => {
      object[prop] = args[2].opts.coerceTypes ? new Date(data) : data
      return true;
    }
  }
})

ajv.addKeyword("laterThan", {
  compile: (refDate, propSchema) => {
    return (data, path, object, key) => {
      return new Date(refDate).getTime() < data.getTime();
    }
  }
})

ajv.addKeyword("earlierThan", {
  compile: (refDate, propSchema) => {
    return (data, path, object, key) => {
      return new Date(refDate).getTime() > data.getTime();
    }
  }
})

ajv.addType("mongoid", {
  modifying: true,
  compile: (...args) => {
    return (data, path, object, prop) => {
      const re = /^(?=[a-f\d]{24}$)(\d+[a-f]|[a-f]+\d)/i;
      if (!re.test(data)) return false;
      object[prop] = args[2].opts.coerceTypes ? ObjectID(data) : data;
      return true;
    }
  }
})

module.exports = ajv;
