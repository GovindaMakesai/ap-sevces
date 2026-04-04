-- database/triggers/review-trigger.sql
-- Create a trigger to automatically update worker ratings

CREATE OR REPLACE FUNCTION update_worker_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE workers 
    SET rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM reviews 
        WHERE worker_id = NEW.worker_id
    ),
    total_reviews = (
        SELECT COUNT(*)
        FROM reviews 
        WHERE worker_id = NEW.worker_id
    )
    WHERE id = NEW.worker_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT
DROP TRIGGER IF EXISTS review_insert_trigger ON reviews;
CREATE TRIGGER review_insert_trigger
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_rating();

-- Create trigger for UPDATE
DROP TRIGGER IF EXISTS review_update_trigger ON reviews;
CREATE TRIGGER review_update_trigger
    AFTER UPDATE OF rating ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_rating();

-- Create trigger for DELETE
DROP TRIGGER IF EXISTS review_delete_trigger ON reviews;
CREATE TRIGGER review_delete_trigger
    AFTER DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_rating();
