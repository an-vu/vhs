// Small raw-WebGL helpers for one full-screen fragment shader per canvas.
export const FULLSCREEN_VS = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';
export const PRECISION = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

export function createProgram(gl, fragmentSource) {
  return startProgram(gl, fragmentSource).finish();
}

// The same, built in the background where the browser can (KHR_parallel_shader_compile):
// asking whether a shader built makes the page wait until it has, a long freeze
// for a big shader on a slow graphics chip (0.2 to 0.4 s on a 2016 MacBook Pro).
// ready() says whether finish() would still wait; without the extension it's
// always true, and finish() builds it then, as createProgram does.
export function startProgram(gl, fragmentSource) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const shaders = [[gl.VERTEX_SHADER, FULLSCREEN_VS], [gl.FRAGMENT_SHADER, PRECISION + fragmentSource]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  });
  const program = gl.createProgram();
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.linkProgram(program);
  return {
    ready: () => !parallel || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR),
    finish: () => finishProgram(gl, program, shaders)
  };
}

function finishProgram(gl, program, shaders) {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const failed = shaders.find(shader => !gl.getShaderParameter(shader, gl.COMPILE_STATUS));
    throw new Error(failed ? gl.getShaderInfoLog(failed) : gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  // One triangle that covers the whole viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  // Every active uniform, keyed by name without the [0] array suffix.
  const U = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
    U[name] = gl.getUniformLocation(program, name);
  }
  return { program, U };
}

export function createTexture(gl, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return {
    unit, texture,
    image(source, flip = true) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    },
    data(width, height, bytes, resized) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (resized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
  };
}
