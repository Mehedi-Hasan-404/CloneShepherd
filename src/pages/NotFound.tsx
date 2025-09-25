import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Tv, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <Tv size={64} className="text-accent mx-auto mb-6" />
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-text-secondary mb-6">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <Link to="/" className="btn-primary">
          <Home size={16} />
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
