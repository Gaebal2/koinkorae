import test from 'node:test';
import assert from 'node:assert/strict';
import {validDescription,assertDescription} from '../supabase/functions/community/description.js';
import {pin} from '../supabase/functions/community/validation.js';
import {dispatch} from '../supabase/functions/community/handler.js';
test('description limits count explicit newlines, normalize pasted CRLF, and reject consecutive blanks',()=>{
  assert.equal(validDescription(Array(10).fill('line').join('\n')),true);
  assert.equal(validDescription(Array(11).fill('line').join('\r\n')),false);
  assert.equal(validDescription('a\n\nb'),true);
  assert.equal(validDescription('a\r\n\r\n\r\nb'),false);
  assert.equal(validDescription('a'.repeat(200)),true);
  assert.throws(()=>assertDescription('a\n\n\nb'));
});
test('pin and publish validation reject excessive line breaks before writing',async()=>{
  const value={title:'title',description:'a\n\n\nb',coin:'BTC',tradeCoins:[],category:'P2P 구매',lat:37,lng:127};
  assert.throws(()=>pin(value));
  assert.equal(pin({...value,description:'a\n\nb'}).category,'P2P 구매');
  const db={one:async()=>({body:{username:'alice'}}),put:async()=>{assert.fail('must not write');}};
  await assert.rejects(dispatch(db,{uid:'alice',name:'alice'},'publish',{value:{coin:'BTC',content:'a\n\n\nb'}}));
});


import {limitDescriptionLines,handleDescriptionInput} from '../src/description-input.js';
test('input drops excess newlines from typing and pasted CRLF without deleting text',()=>{
  assert.equal(limitDescriptionLines('a\n\n\nb'),'a\n\nb');
  assert.equal(limitDescriptionLines('a\r\n\r\n\r\nb'),'a\n\nb');
  const pasted=Array.from({length:12},(_,i)=>String(i)).join('\n');
  const result=limitDescriptionLines(pasted);
  assert.equal(result.split('\n').length,10);
  assert.equal(result.replaceAll('\n',''),pasted.replaceAll('\n',''));
  assert.equal(validDescription(result),true);
  assert.equal(limitDescriptionLines('가나다\n\n라마바'),'가나다\n\n라마바');
});
test('blocked Enter restores the caret and value even when React state stays unchanged',()=>{
  const input={value:'a\n\n\nb',selectionStart:4,selectionEnd:4,setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
  let updated;
  handleDescriptionInput({currentTarget:input},value=>{updated=value;});
  assert.equal(updated,'a\n\nb');assert.equal(input.value,updated);assert.equal(input.selectionStart,3);
});
