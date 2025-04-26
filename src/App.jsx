import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, RefreshCw, ChevronRight } from 'lucide-react';

const tabs = ['URL', 'Base64', 'JWT', 'Unicode'];

const App = () => {
  useEffect(() => {
    console.log('App render');
  }, []);

  const [activeTab, setActiveTab] = useState('URL');
  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-gradient-to-b from-gray-800 to-black">
      <h1 className="text-4xl font-extrabold mb-6">Encode / Decode Tool</h1>
      <div className="bg-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl p-4">
        <div className="flex border-b border-gray-600 mb-4">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`flex-1 py-2 text-center font-medium ${
                activeTab === tab ? 'text-white border-b-2 border-indigo-400' : 'text-gray-400'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="relative">
          <AnimatePresence mode="wait">
            {activeTab === 'URL' && <TabContent key="URL" type="URL" />}
            {activeTab === 'Base64' && <TabContent key="Base64" type="Base64" />}
            {activeTab === 'JWT' && <TabContent key="JWT" type="JWT" />}
            {activeTab === 'Unicode' && <TabContent key="Unicode" type="Unicode" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const TabContent = ({ type }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const handleEncode = () => {
    let res = '';
    try {
      switch (type) {
        case 'URL':
          res = encodeURIComponent(input);
          break;
        case 'Base64':
          res = btoa(unescape(encodeURIComponent(input)));
          break;
        case 'Unicode':
          res = input.split('').map(c => c.charCodeAt(0)).join(' ');
          break;
        case 'JWT':
          try {
            const { header, payload } = JSON.parse(input);
            const h = btoa(unescape(encodeURIComponent(JSON.stringify(header))));
            const p = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            res = `${h}.${p}.<signature>`;
          } catch {
            res = 'Invalid JSON format. Provide {"header":..., "payload":...}';
          }
          break;
        default:
          res = '';
      }
    } catch {
      res = 'Error';
    }
    setOutput(res);
  };

  const handleDecode = () => {
    let res = '';
    try {
      switch (type) {
        case 'URL':
          res = decodeURIComponent(input);
          break;
        case 'Base64':
          res = decodeURIComponent(escape(atob(input)));
          break;
        case 'Unicode':
          res = input.split(' ').map(code => String.fromCharCode(+code)).join('');
          break;
        case 'JWT':
          const parts = input.split('.');
          if (parts.length < 2) throw new Error();
          const hd = JSON.parse(decodeURIComponent(escape(atob(parts[0]))));
          const pl = JSON.parse(decodeURIComponent(escape(atob(parts[1]))));
          res = JSON.stringify({ header: hd, payload: pl, signature: parts[2] || '' }, null, 2);
          break;
        default:
          res = '';
      }
    } catch {
      res = 'Invalid input';
    }
    setOutput(res);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-4"
    >
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={`${type} input`}
        rows={5}
        className="w-full bg-gray-800 rounded-lg p-3 text-sm"
      />
      <div className="flex space-x-4">
        <button
          onClick={handleEncode}
          className="flex-1 py-2 bg-indigo-500 rounded-lg hover:bg-indigo-600 flex items-center justify-center space-x-2 text-sm"
        >
          <RefreshCw size={16} /> <span>Encode</span>
        </button>
        <button
          onClick={handleDecode}
          className="flex-1 py-2 bg-green-500 rounded-lg hover:bg-green-600 flex items-center justify-center space-x-2 text-sm"
        >
          <ChevronRight size={16} /> <span>Decode</span>
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(output)}
          className="py-2 px-4 bg-gray-600 rounded-lg hover:bg-gray-500 flex items-center space-x-2 text-sm"
        >
          <Copy size={16} /> <span>Copy</span>
        </button>
      </div>
      <textarea
        value={output}
        readOnly
        rows={5}
        className="w-full bg-gray-800 rounded-lg p-3 text-sm"
      />
    </motion.div>
  );
};

export default App;
