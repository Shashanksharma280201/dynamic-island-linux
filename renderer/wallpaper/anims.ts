/**
 * The island's live wallpapers: small fragment shaders drawn at half
 * resolution and a low frame rate (they move slowly), so they cost little.
 * Each returns a way to rest (stop drawing) and play again.
 */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'

const NOISE = `
float hash(vec2 p){p=mod(p,512.);return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
`

// High precision where the GPU has it: the noise needs it on big screens.
const HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nuniform float t;uniform vec2 r;uniform vec3 ca;uniform vec3 cb;uniform vec3 cc;'

/** Soft colour, drifting slowly: four glowing blobs. */
const GLOW = `${HEAD}
float blob(vec2 p,vec2 c,float k){vec2 d=p-c;return exp(-k*dot(d,d));}
void main(){
  vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;vec2 p=vec2(uv.x*a,uv.y);
  vec2 b1=vec2(a*(.3+.18*sin(t*.05)),.35+.2*cos(t*.04));
  vec2 b2=vec2(a*(.72+.18*cos(t*.045)),.66+.18*sin(t*.05));
  vec2 b3=vec2(a*(.52+.24*sin(t*.035+1.)),.18+.14*cos(t*.06));
  vec2 b4=vec2(a*(.18+.14*cos(t*.03+2.)),.84+.1*sin(t*.04));
  vec3 col=vec3(.03,.02,.07);
  col+=vec3(.36,.29,.86)*blob(p,b1,3.);
  col+=vec3(.78,.23,.56)*blob(p,b2,3.2);
  col+=vec3(.94,.54,.29)*blob(p,b3,4.);
  col+=vec3(.13,.42,.86)*blob(p,b4,3.5);
  col=col/(1.+col*.35);
  gl_FragColor=vec4(col,1.);
}`

/** Northern lights over a dark sky, with a few stars. */
const AURORA = `${HEAD}${NOISE}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec3 col=mix(vec3(.01,.02,.06),vec3(.02,.06,.12),uv.y);
  float band=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    float y=.55+.12*fi+.07*sin(uv.x*3.+t*.1+fi)+.12*(fbm(vec2(uv.x*2.+t*.03,fi))-.5);
    float d=uv.y-y;
    band+=exp(-d*d*160.)*(.55+.45*fbm(vec2(uv.x*6.-t*.05,fi*3.)));
  }
  col+=band*mix(vec3(.12,.75,.56),vec3(.42,.36,1.),clamp(uv.y*1.3-.5,0.,1.))*.95;
  float s=step(.9975,hash(floor(gl_FragCoord.xy)))*(.55+.45*sin(t+hash(floor(gl_FragCoord.xy)+3.)*20.));
  col+=s*(1.-clamp(band,0.,1.))*.8;
  gl_FragColor=vec4(col,1.);
}`

/** Layers of sea at dusk, under a low sun. */
const WAVES = `${HEAD}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec3 col=mix(vec3(.96,.58,.33),vec3(.04,.11,.23),smoothstep(.32,1.,uv.y));
  vec2 d=(uv-vec2(.5,.42))*vec2(r.x/r.y,1.);
  col+=vec3(1.,.76,.47)*exp(-dot(d,d)*55.)*.9;
  for(int i=0;i<5;i++){
    float fi=float(i);
    float h=.39-fi*.07+.018*sin(uv.x*(6.+fi*2.)+t*(.3+fi*.1)+fi)+.008*sin(uv.x*17.-t*.7+fi*3.);
    vec3 sea=mix(vec3(.16,.46,.62),vec3(.02,.07,.17),fi/4.);
    col=mix(col,sea,smoothstep(h+.003,h-.003,uv.y));
  }
  gl_FragColor=vec4(col,1.);
}`

/** Stars drifting past in three layers. */
const STARS = `${HEAD}${NOISE}
void main(){
  vec2 uv=(gl_FragCoord.xy-r*.5)/r.y;
  vec3 col=mix(vec3(.01,.012,.03),vec3(.06,.07,.16),gl_FragCoord.y/r.y);
  for(int l=0;l<3;l++){
    float fl=float(l);
    vec2 p=uv*(10.+fl*12.)+vec2(t*(.05+fl*.04),t*.012*fl);
    vec2 id=floor(p);vec2 f=fract(p)-.5;
    float h=hash(id+fl*13.);
    if(h>.8){
      vec2 o=vec2(hash(id+1.7),hash(id+3.1))-.5;
      float dd=length(f-o*.7);
      float tw=.6+.4*sin(t*1.5+h*30.);
      col+=vec3(.85,.9,1.)*smoothstep(.07/(1.+fl*.6),0.,dd)*tw*(1.-fl*.22);
    }
  }
  gl_FragColor=vec4(col,1.);
}`

/** One gentle gradient whose colours follow the time of day. */
const GRADIENT = `${HEAD}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  float k=clamp(uv.x*.55+uv.y*.45+.07*sin(t*.05+uv.y*3.)+.05*cos(t*.04+uv.x*2.),0.,1.);
  vec3 col=k<.5?mix(ca,cb,smoothstep(0.,1.,k*2.)):mix(cb,cc,smoothstep(0.,1.,(k-.5)*2.));
  gl_FragColor=vec4(col,1.);
}`

const SHADERS: Record<string, { frag: string; fps: number }> = {
  glow: { frag: GLOW, fps: 20 },
  aurora: { frag: AURORA, fps: 24 },
  waves: { frag: WAVES, fps: 24 },
  stars: { frag: STARS, fps: 30 },
  gradient: { frag: GRADIENT, fps: 12 },
}

/** The gradient's colours for an hour of the day: dawn, day, dusk, night. Pure. */
export function dayColors(hour: number): [number[], number[], number[]] {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  if (hour >= 5 && hour < 9) return [hex('#f6d365'), hex('#fda085'), hex('#a18cd1')]
  if (hour >= 9 && hour < 17) return [hex('#4facfe'), hex('#8ec5fc'), hex('#e0c3fc')]
  if (hour >= 17 && hour < 21) return [hex('#1d2b64'), hex('#c06c84'), hex('#f8b195')]
  return [hex('#0f2027'), hex('#203a43'), hex('#2c5364')]
}

/** The fallback when there's no WebGL: the animation's colours as a still gradient. */
export function fallback(canvas: HTMLCanvasElement, colors: string[]): void {
  canvas.style.background = `linear-gradient(135deg, ${colors.join(', ')})`
}

export function startAnimation(id: string, canvas: HTMLCanvasElement): { rest: (on: boolean) => void } | null {
  const spec = SHADERS[id]
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true })
  if (!spec || !gl) return null
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, spec.frag))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const uT = gl.getUniformLocation(prog, 't')
  const uR = gl.getUniformLocation(prog, 'r')
  const uA = gl.getUniformLocation(prog, 'ca')
  const uB = gl.getUniformLocation(prog, 'cb')
  const uC = gl.getUniformLocation(prog, 'cc')
  // Half resolution: these are soft shapes, and it quarters the work.
  const size = () => {
    canvas.width = Math.max(320, Math.round(innerWidth * 0.5))
    canvas.height = Math.max(180, Math.round(innerHeight * 0.5))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  size()
  addEventListener('resize', size)
  const start = performance.now() - Math.random() * 600_000
  let raf = 0
  let last = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (now - last < 1000 / spec.fps) return
    last = now
    const [a, b, c] = dayColors(new Date().getHours())
    gl.uniform1f(uT, (now - start) / 1000)
    gl.uniform2f(uR, canvas.width, canvas.height)
    gl.uniform3fv(uA, a)
    gl.uniform3fv(uB, b)
    gl.uniform3fv(uC, c)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  raf = requestAnimationFrame(frame)
  return {
    rest: (on) => {
      cancelAnimationFrame(raf)
      if (!on) raf = requestAnimationFrame(frame)
    },
  }
}
