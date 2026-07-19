"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var discovery_1 = require("../src/contextforge/discovery");
var requirement_extractor_1 = require("../src/contextforge/requirement-extractor");
// A deliberately complex, multi-faceted project designed to trigger 
// a massive amount of functional requirements and edge cases.
var MASSIVE_PROJECT = {
    projectName: "Global Omni-Commerce & Logistics Engine",
    platform: "web-and-mobile-hybrid",
    description: "We are building a massive enterprise-grade global e-commerce and logistics platform. \nIt must handle B2B wholesale, B2C retail, and C2C marketplace sales simultaneously. \nKey components:\n1. Multi-vendor marketplace with real-time commission splitting, tax calculation (VAT, GST, State Tax), and localized currency conversion.\n2. AI-driven predictive logistics: real-time GPS tracking of delivery drivers, route optimization, warehouse inventory forecasting, and automated drone dispatch integration.\n3. Social commerce: users can live-stream products, create affiliate links, post video reviews, and chat in real-time with vendors.\n4. Fintech layer: built-in digital wallet, crypto payments, BNPL (Buy Now Pay Later) integration, and automated seller payouts.\n5. Administrative backend: full RBAC, fraud detection AI, KYC/AML verification workflows, support ticketing, and GDPR/CCPA automated compliance.\n6. Offline mode: mobile apps must support offline catalogue browsing and syncing carts when connection is restored.\nIt needs to scale to 10 million daily active users with 99.999% uptime.",
    features: [
        "multi-vendor", "commission splitting", "live streaming", "real-time chat",
        "crypto payments", "BNPL", "GPS tracking", "route optimization",
        "fraud detection", "KYC", "offline mode", "support ticketing", "inventory forecasting"
    ],
    constraints: {
        forbiddenTools: [],
        forbiddenCategories: [],
        requiredToolTypes: ["Enterprise Database", "Global CDN", "Realtime PubSub"],
        mustBeOffline: true,
        mustUseLocalStorage: true,
        rawConstraints: ["Must scale to 10M DAU", "99.999% uptime"],
        compliance: ["GDPR", "CCPA", "KYC", "AML", "PCI-DSS"],
    }
};
function runTest() {
    return __awaiter(this, void 0, void 0, function () {
        var start, result, err_1, start, result, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("=== 1. Testing discoverCategories (maxTokens: 1200) ===");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    start = Date.now();
                    return [4 /*yield*/, (0, discovery_1.discoverCategories)(MASSIVE_PROJECT)];
                case 2:
                    result = _a.sent();
                    console.log("\u2705 Success in ".concat(Date.now() - start, "ms"));
                    console.log("- Project Type: ".concat(result.projectType));
                    console.log("- Categories Found: ".concat(result.requiredCategories.length));
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error("❌ Failed discoverCategories:");
                    console.error(err_1);
                    return [3 /*break*/, 4];
                case 4:
                    console.log("\n=== 2. Testing extractArchitecturalRequirements (maxTokens: 2500) ===");
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    start = Date.now();
                    return [4 /*yield*/, (0, requirement_extractor_1.extractArchitecturalRequirements)(MASSIVE_PROJECT.description, MASSIVE_PROJECT.platform, MASSIVE_PROJECT.projectName)];
                case 6:
                    result = _a.sent();
                    console.log("\u2705 Success in ".concat(Date.now() - start, "ms"));
                    console.log("- Functional Requirements: ".concat(result.functional.length));
                    console.log("- Edge Cases: ".concat(result.edgeCases.length));
                    // Check if it fell back to heuristics due to a Zod parse error (truncation)
                    if (result.functional.length < 5) {
                        console.log("⚠️ WARNING: This looks like a heuristic fallback. The AI likely truncated, failed Zod validation, and gracefully fell back.");
                    }
                    else {
                        console.log("🔥 AI extraction succeeded without truncation!");
                    }
                    return [3 /*break*/, 8];
                case 7:
                    err_2 = _a.sent();
                    console.error("❌ Failed extractArchitecturalRequirements:");
                    console.error(err_2);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
// Make sure Groq is configured
if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is not set.");
    process.exit(1);
}
runTest();
