import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapter, internalStoryHref, stageKeys, stageMilestones, usableStoryImage } from '../components/about-story/types.ts';

const image = {id:'a1',url:'https://cdn.toantrungxeluot.io.vn/assets/example.jpg',width:1200,height:800,alt:'Showroom thực tế',placement:'desktop'};
const chapters = ['opening','milestones','stories','people','future'].map(key=>({key,title:key,images:key==='opening'?[image]:[]}));
const page = {chapters,milestones:stageKeys.map((stage,i)=>({id:String(i),stage,periodLabel:i===1?'2018–2019':String(1997+i),title:`Mốc ${i}`})),stories:[]};

test('five chapters remain in fixed order regardless of API array order',()=>{
  page.chapters.reverse();
  assert.deepEqual(['opening','milestones','stories','people','future'].map(key=>chapter(page,key)?.key),['opening','milestones','stories','people','future']);
});

test('year ranges stay as labels, never become invented exact dates',()=>{
  assert.equal(stageMilestones(page,'2018-2022')[0].periodLabel,'2018–2019');
  assert.deepEqual(stageMilestones(page,'2026').map(item=>item.stage),['2026']);
});

test('CTA rejects offsite, protocol-relative and malformed paths',()=>{
  assert.equal(internalStoryHref('/san-pham'),'/san-pham');
  for(const href of ['https://example.com','//example.com','/San-Pham','javascript:alert(1)','/san-pham?token=x']) assert.equal(internalStoryHref(href),null);
});

test('media requires usable HTTPS URL, positive dimensions and alt',()=>{
  assert.equal(usableStoryImage(image),true);
  assert.equal(usableStoryImage({...image,alt:''}),false);
  assert.equal(usableStoryImage({...image,width:0}),false);
  assert.equal(usableStoryImage({...image,url:'http://cdn.example.com/a.jpg'}),false);
});
