/*
@brief Extract a rectangular ROI from an image.
@param img (cv.Mat)
@param rect (cv.Rect)
@return position (cv.Rect), data (cv.Mat)
*/
function extractRectFromImage(img, rect) {
    const { width, height } = img.size();
    x_i = Math.max(0, rect.x);
    x_f = Math.min(width, rect.x + rect.width);
    y_i = Math.max(0, rect.y);
    y_f = Math.min(height, rect.y + rect.height);
    const valid_rect = new cv.Rect(x_i, y_i, x_f - x_i, y_f - y_i);
    return {
        position: valid_rect,
        data: img.roi(valid_rect)
    };
}

/*
@brief Extract a foreground object in a rectangle.
@param img (cv.Mat | type cv.CV_8UC3)
@param rect (cv.Rect)
@param iters (number)
@param padding (number)
@return mask (cv.Mat | type cv.CV_8UC1), bgdModel (cv.Mat | type cv.CV_64FC1), fgdModel: (cv.Mat | type cv.CV_64FC1)

TODO: Try a resizing (double the size) to see if effects are better for small images
*/
function rectGrabCut(img, rect, iters = 3, padding = 25) {
    const rect_expanded = new cv.Rect(
        rect.x - padding,
        rect.y - padding,
        rect.width + 2 * padding,
        rect.height + 2 * padding
    );
    const { position, data } = extractRectFromImage(img, rect_expanded);
    const mask = new cv.Mat();
    const bgdModel = new cv.Mat();
    const fgdModel = new cv.Mat();
    const rect_effective = new cv.Rect(
        rect.x - position.x,
        rect.y - position.y,
        rect.width,
        rect.height
    );
    cv.grabCut(data, mask, rect_effective, bgdModel, fgdModel, iters, cv.GC_INIT_WITH_RECT);
    data.delete();
    const { width, height } = img.size();
    // note that cv.GC_BGD == 0
    const overall_mask = new cv.Mat.zeros(height, width, cv.CV_8UC1);
    for (let row = 0; row < position.height - 1; row++) {
        for (let col = 0; col < position.width - 1; col++)
            overall_mask.ucharPtr(row + position.y, col + position.x)[0] = mask.ucharAt(row, col);
    }
    mask.delete();
    return {
        mask: overall_mask,
        bgdModel: bgdModel,
        fgdModel: fgdModel
    };
}

/*
@brief Extract a foreground object in a rotated rectangle.
@param img (cv.Mat | type cv.CV_8UC3)
@param rrect (cv.RotatedRect)
@param iters (number)
@param padding (number)
@return mask (cv.Mat | type cv.CV_8UC1), bgdModel (cv.Mat | type cv.CV_64FC1), fgdModel: (cv.Mat | type cv.CV_64FC1)

Note: Our desired image transformation involves a translation, then rotation,
then translation. The second two operations can be combined into a single
affine transformation. The first makes up its own affine transformation.
The purpose of affine1 is to move the box into the center of the image. The
purpose of affine2 is to rotate the image about the center.
*/
function rrectGrabCut(img, rrect, iters = 3, padding = 25) {
    const center = new cv.Point(img.cols / 2, img.rows / 2);
    const affine1 = new cv.matFromArray(2, 3, cv.CV_64FC1, [
        1, 0, center.x - rrect.center.x,
        0, 1, center.y - rrect.center.y
    ]);
    const rectified = new cv.Mat();
    cv.warpAffine(img, rectified, affine1, img.size(), cv.INTER_NEAREST, cv.BORDER_WRAP);
    const affine2 = cv.getRotationMatrix2D(center, rrect.angle, 1);
    cv.warpAffine(rectified, rectified, affine2, rectified.size(), cv.INTER_NEAREST, cv.BORDER_WRAP);
    const rect = new cv.Rect(
        center.x - rrect.size.width / 2,
        center.y - rrect.size.height / 2,
        rrect.size.width,
        rrect.size.height
    );
    const { mask, bgdModel, fgdModel } = rectGrabCut(rectified, rect, iters, padding);
    rectified.delete();
    cv.warpAffine(mask, mask, affine2, mask.size(), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP);
    cv.warpAffine(mask, mask, affine1, mask.size(), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP);
    affine1.delete();
    affine2.delete();
    return {
        mask: mask,
        bgdModel: bgdModel,
        fgdModel: fgdModel
    };
}

/*
@brief Extract a foreground object given an annotated mask.
@param img (cv.Mat | type cv.CV_8UC3)
@param mask (cv.Mat | type cv.CV_8UC1)
@param bgdModel (cv.Mat | type cv.CV_64FC1) OPTIONAL
@param fgdModel (cv.Mat | type cv.CV_64FC1) OPTIONAL
@return (object with fields: mask, bgdModel, and fgdModel)
@note mask: (cv.Mat | type cv.CV_8UC1)
      bgdModel: (cv.Mat | type cv.CV_64FC1)
      fgdModel: (cv.Mat | type cv.CV_64FC1)
*/
function maskGrabCut(img, mask, bgdModel, fgdModel, iters = 2) {
    cv.grabCut(img, mask, new cv.Rect(), bgdModel, fgdModel, iters, cv.GC_INIT_WITH_MASK);
    return {
        mask: mask,
        bgdModel: bgdModel,
        fgdModel: fgdModel
    };
}