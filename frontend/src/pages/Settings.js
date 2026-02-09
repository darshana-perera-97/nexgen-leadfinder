import { useState, useEffect } from 'react';
import API_ENDPOINTS from '../config/api';

function Settings() {
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Fetch categories on component mount
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.CATEGORIES);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      alert('Please enter a category name');
      return;
    }

    setCategoryLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.CATEGORIES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: categoryName }),
      });

      if (response.ok) {
        const newCategory = await response.json();
        setCategories([...categories, newCategory]);
        setCategoryName('');
        alert('Category added successfully!');
      } else {
        const error = await response.json();
        alert(error.error || 'Error adding category');
      }
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category');
    } finally {
      setCategoryLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4" style={{ fontWeight: '600', color: '#1e293b' }}>Settings</h2>

      {/* Categories Section */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">Categories</h5>
          
          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="mb-4">
            <div className="row g-3">
              <div className="col-12 col-md-10">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter category name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  required
                />
              </div>
              <div className="col-12 col-md-2">
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={categoryLoading}
                >
                  {categoryLoading ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </div>
          </form>

          {/* View Categories */}
          <div>
            <h6 className="mb-3">All Categories</h6>
            {categories.length === 0 ? (
              <p className="text-muted">No categories added yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-striped">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id}>
                        <td>{cat.id}</td>
                        <td>
                          <span className="badge bg-primary">
                            {cat.name}
                          </span>
                        </td>
                        <td>
                          {new Date(cat.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;

