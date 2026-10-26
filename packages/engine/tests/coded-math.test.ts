import { test } from "node:test";
import assert from "node:assert/strict";
import { repairMathForDisplay, transformMathDelimiters, unwrapCodedMath } from "../src/core/math-delims.ts";

test("math dollars inside an inline code span are dropped, code kept", () => {
	const q = "In MATLAB, `$A = [1,2;3,4]$` and `$B = [5,6;7,8]$`. What is `$A .* B$`?";
	const want = "In MATLAB, `A = [1,2;3,4]` and `B = [5,6;7,8]`. What is `A .* B`?";
	assert.equal(unwrapCodedMath(q), want);
	assert.equal(repairMathForDisplay(q), want);
	assert.equal(transformMathDelimiters(q), want);
});

test("plain code, real math and fenced blocks are untouched", () => {
	for (const s of ["use `.*` here", "$x^2$ and `x.^2`", "```\nx = `$a$`\n```", "`$HOME` path", "$$\na\n$$"]) {
		assert.equal(unwrapCodedMath(s), s);
	}
});
