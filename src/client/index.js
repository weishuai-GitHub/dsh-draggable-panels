// Use the host's opaque React object directly; do not enumerate its exports.
const React = require("react");
import { createPlugin } from "./plugin.js";
export default createPlugin(React);
