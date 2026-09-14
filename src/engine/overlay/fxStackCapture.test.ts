import { describe, it, expect } from 'vitest';
import { keyFxStack } from './fxStackCapture';
const frame=(data:number[])=>new ImageData(new Uint8ClampedArray(data),data.length/4,1);
describe('same-frame FX coverage',()=>{
 it('removes unchanged content of every color including bright and black pixels',()=>{
 const source=frame([255,0,80,255,0,0,0,255,255,255,255,255]);
 expect([...keyFxStack(source,source,source,0).data]).toEqual(Array(12).fill(0));
 });
 it('retains changed source content, including effects that become black or white',()=>{
 const before=frame([80,80,80,255,80,80,80,255,255,0,50,255]);
 const after=frame([0,0,0,255,255,255,255,255,255,0,50,255]);
 expect([...keyFxStack(after,before,after,.02).data]).toEqual([0,0,0,255,255,255,255,255,0,0,0,0]);
 });
 it('preserves finished colors, existing alpha, and soft change coverage',()=>{
 const before=frame([100,100,100,255]),after=frame([110,100,100,255]),finished=frame([220,50,20,128]);
 const out=keyFxStack(finished,before,after,.02);expect([...out.data.slice(0,3)]).toEqual([220,50,20]);expect(out.data[3]).toBeGreaterThan(0);expect(out.data[3]).toBeLessThan(128);
 });
 it('rejects mismatched frame sizes',()=>{expect(()=>keyFxStack(frame([0,0,0,255]),frame([0,0,0,255,1,1,1,255]),frame([0,0,0,255]),0)).toThrow();});
});
