'use client';
import { useState, useEffect } from 'react';

export default function CleanupPage() {
  const [activeTab, setActiveTab] = useState('queue');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
        const res = await fetch(`/api/cleanup/read?type=${activeTab}`);
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);

        const text = await res.text();
        if (!text) {
            setData([]); 
            return;
        }

        const json = JSON.parse(text);
        setData(json);

    } catch (e) {
        console.error("Failed to fetch cleanup data:", e);
        setData([]); 
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  return (
    <div className="p-6 text-white min-h-screen font-sans">
      <h1 className="text-3xl font-bold mb-6">Media Cleanup Observer</h1>

      <div className="flex border-b border-gray-700 mb-6">
        <button
          className={`px-6 py-2 ${activeTab === 'queue' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
          onClick={() => setActiveTab('queue')}
        >
          Oldest Candidates (500)
        </button>
        <button
          className={`px-6 py-2 ${activeTab === 'history' ? 'border-b-2 border-red-500 text-red-400' : 'text-gray-400'}`}
          onClick={() => setActiveTab('history')}
        >
          Recently Deleted
        </button>
      </div>

      <div className="bg-gray-900 rounded shadow overflow-x-auto border border-gray-700">
        <table className="w-full text-left">
          <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
            <tr>
              <th className="p-4">Title / Path</th>
              <th className="p-4">Date Added</th>
              <th className="p-4">Last Watched</th>
              {activeTab === 'history' && <th className="p-4 text-red-400">Deleted On</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-gray-500">Loading...</td></tr>
            ) : data.map((item, i) => (
              <tr key={i} className="hover:bg-gray-800/50">
                <td className="p-4 text-sm break-all">
                    <div className="font-bold text-gray-200">{item.title}</div>
                    <div className="text-gray-500 text-xs">{item.filepath}</div>
                </td>
                <td className="p-4 text-sm text-gray-400 whitespace-nowrap font-mono">
                    {item.added_at ? new Date(item.added_at).toLocaleDateString() : "-"}
                </td>
                <td className="p-4 text-sm text-yellow-500 whitespace-nowrap font-mono">
                    {item.last_active ? new Date(item.last_active).toLocaleDateString() : "Never"}
                </td>
                {activeTab === 'history' && (
                  <td className="p-4 text-sm text-red-400 whitespace-nowrap font-bold font-mono">
                    {new Date(item.deleted_at).toLocaleString()}
                  </td>
                )}
              </tr>
            ))}
            {!loading && data.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500 italic">No items found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}