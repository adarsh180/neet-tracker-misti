import assert from "node:assert/strict";
import test from "node:test";
import { validPassageBox, passageStyle } from "../src/lib/reader-geometry";
test("highlights require finite normalized source coordinates", () => {
  assert.equal(validPassageBox({x:.1,y:.2,width:.6,height:.1}),true);
  for (const box of [null,{}, {x:10,y:20,width:100,height:30}, {x:.9,y:0,width:.5,height:.1}, {x:0,y:0,width:NaN,height:.1}]) assert.equal(validPassageBox(box),false);
  assert.deepEqual(passageStyle({x:.1,y:.2,width:.6,height:.1}),{left:"10%",top:"20%",width:"60%",height:"10%"});
});
