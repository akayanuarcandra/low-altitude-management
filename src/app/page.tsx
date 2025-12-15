/**
 * Home Page (Index)
 * 
 * This is your custom index page. Create your own content here!
 * Currently it's a placeholder—design it however you want.
 * 
 * Link to /dashboard to see your tasks:
 * <Link href="/dashboard">Go to Dashboard</Link>
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center items-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Altitude</h1>
        <p className="text-gray-600 mb-8">Build something amazing...</p>
        {/* Add your custom content here */}
      </div>
    </div>
  );
}