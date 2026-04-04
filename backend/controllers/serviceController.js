// backend/controllers/serviceController.js
const Service = require('../models/Service');
const db = require('../config/database');

// ==================== WORKERS FOR SERVICE ====================
// @desc    Get workers for a specific service
// @route   GET /api/services/:id/workers
// @access  Public
exports.getWorkersForService = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 Fetching workers for service:', id);
        
        // First, get the service to know its category
        const serviceResult = await db.query('SELECT id, name, category FROM services WHERE id = $1', [id]);
        
        if (serviceResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        
        const serviceCategory = serviceResult.rows[0].category;
        console.log('📦 Service category:', serviceCategory);
        
        // Get workers that offer services in THIS CATEGORY
        const query = `
            SELECT DISTINCT w.id, w.user_id, w.bio, w.experience_years, w.hourly_rate, 
                   w.rating, w.total_reviews, w.is_available,
                   u.first_name, u.last_name, u.email, u.phone, u.profile_pic
            FROM workers w
            JOIN users u ON w.user_id = u.id
            JOIN worker_services ws ON w.id = ws.worker_id
            JOIN services s ON ws.service_id = s.id
            WHERE s.category = $1
              AND w.is_approved = true 
              AND w.is_available = true
              AND ws.is_available = true
            ORDER BY w.rating DESC NULLS LAST
        `;
        
        const result = await db.query(query, [serviceCategory]);
        console.log('📦 Workers found for category:', result.rows.length);
        
        if (result.rows.length > 0) {
            console.log('👤 First worker:', result.rows[0].first_name, result.rows[0].last_name);
        }
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
        
    } catch (error) {
        console.error('❌ Get workers for service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get workers',
            error: error.message
        });
    }
};

// ==================== ALL SERVICES ====================
// @desc    Get all services
// @route   GET /api/services
// @access  Public
exports.getAllServices = async (req, res) => {
    try {
        const { category, search } = req.query;
        
        const services = await Service.getAll({ category, search });
        
        res.json({
            success: true,
            count: services.length,
            data: services
        });
    } catch (error) {
        console.error('Get services error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get services'
        });
    }
};

// ==================== SERVICE BY ID ====================
// @desc    Get service by ID
// @route   GET /api/services/:id
// @access  Public
exports.getServiceById = async (req, res) => {
    try {
        const serviceId = req.params.id;
        
        const service = await Service.getById(serviceId);
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        
        // Get workers offering this service
        const workers = await Service.getWorkersForService(serviceId, req.query);
        
        res.json({
            success: true,
            data: {
                ...service,
                workers
            }
        });
    } catch (error) {
        console.error('Get service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get service'
        });
    }
};

// ==================== CATEGORIES ====================
// @desc    Get all categories
// @route   GET /api/services/categories/all
// @access  Public
exports.getCategories = async (req, res) => {
    try {
        const categories = await Service.getCategories();
        
        res.json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get categories'
        });
    }
};

// ==================== SERVICES BY CATEGORY ====================
// @desc    Get services by category
// @route   GET /api/services/category/:category
// @access  Public
exports.getServicesByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        
        const services = await Service.getByCategory(category);
        
        res.json({
            success: true,
            count: services.length,
            data: services
        });
    } catch (error) {
        console.error('Get services by category error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get services'
        });
    }
};

// ==================== SEARCH SERVICES ====================
// @desc    Search services
// @route   GET /api/services/search
// @access  Public
exports.searchServices = async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }
        
        const services = await Service.search(q);
        
        res.json({
            success: true,
            count: services.length,
            query: q,
            data: services
        });
    } catch (error) {
        console.error('Search services error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search services'
        });
    }
};

// ==================== POPULAR SERVICES ====================
// @desc    Get popular services
// @route   GET /api/services/popular
// @access  Public
exports.getPopularServices = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const services = await Service.getPopular(parseInt(limit));
        
        res.json({
            success: true,
            count: services.length,
            data: services
        });
    } catch (error) {
        console.error('Get popular services error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get popular services'
        });
    }
};

// ==================== CREATE SERVICE (ADMIN) ====================
// @desc    Create new service (admin only)
// @route   POST /api/services
// @access  Private/Admin
exports.createService = async (req, res) => {
    try {
        // Check if user is admin
        if (req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can create services'
            });
        }
        
        const { name, category, description, icon, base_price, price_type } = req.body;
        
        // Validate required fields
        if (!name || !category || !base_price || !price_type) {
            return res.status(400).json({
                success: false,
                message: 'Name, category, base price, and price type are required'
            });
        }
        
        const service = await Service.create({
            name,
            category,
            description,
            icon,
            base_price,
            price_type
        });
        
        res.status(201).json({
            success: true,
            message: 'Service created successfully',
            data: service
        });
    } catch (error) {
        console.error('Create service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create service'
        });
    }
};

// ==================== UPDATE SERVICE (ADMIN) ====================
// @desc    Update service (admin only)
// @route   PUT /api/services/:id
// @access  Private/Admin
exports.updateService = async (req, res) => {
    try {
        // Check if user is admin
        if (req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can update services'
            });
        }
        
        const serviceId = req.params.id;
        
        const service = await Service.update(serviceId, req.body);
        
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Service updated successfully',
            data: service
        });
    } catch (error) {
        console.error('Update service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update service'
        });
    }
};
